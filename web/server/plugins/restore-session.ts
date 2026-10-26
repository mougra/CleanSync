import { appendResponseHeader, getCookie, getHeader } from 'h3';

/**
 * Значения `Set-Cookie` из ответа внутреннего API.
 *
 * `Headers.getSetCookie()` есть в Node 20+, но заголовок может прийти и одной
 * склеенной строкой (старые прокси), поэтому оставляем запасной путь.
 */
const setCookieValues = (headers: Headers): string[] => {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  if (typeof getSetCookie === 'function') {
    const values = getSetCookie.call(headers);

    if (values.length > 0) {
      return values;
    }
  }

  const single = headers.get('set-cookie');

  return single ? [single] : [];
};

/**
 * Восстановление сессии на сервере.
 *
 * Зачем: access-cookie живёт 15 минут. Если человек вернулся позже, но
 * refresh-cookie ещё жива, серверный рендер уходил в API со старым access и
 * получал ответ как для гостя — страница отрисовывалась без прогресса, карточек
 * челленджа и статистики, а правильную картину показывал только клиент после
 * собственного обновления токена. Это и была «вспышка» гостевого состояния.
 *
 * Здесь мы один раз за запрос проверяем сессию и, если access просрочен, меняем
 * его на свежий. Токен кладём в `event.context`, откуда его забирает `useApi` и
 * подставляет в пробрасываемую cookie (сервер отдаёт приоритет именно cookie).
 *
 * Новые cookie отдаём и браузеру: API обновляет не только access, но и
 * refresh-токен — строка в `refresh_tokens` заменяется новой (ротация). Раньше
 * `Set-Cookie` внутреннего запроса до браузера не доходил: в базе лежал новый
 * refresh-токен, а в браузере оставался старый. Первый же клиентский 401 после
 * истечения access-cookie заканчивался отказом `/api/auth/refresh`, и человек
 * вылетал из аккаунта через четверть часа, хотя сессия была жива.
 *
 * Работает это только потому, что refresh-cookie выдаётся на всём сайте
 * (`path=/`, см. `backend/cookies.ts`): cookie с путём `/api/auth` браузер на
 * запрос страницы `/` не присылает, и плагин не видел сессию вовсе.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', async (event) => {
    const path = event.path || '';

    // Только страницы: API, ассеты и служебные маршруты не трогаем
    if (path.startsWith('/api') || path.startsWith('/_') || path.startsWith('/__')) {
      return;
    }

    const cookie = getHeader(event, 'cookie');

    // Без refresh-cookie обновлять нечего: это обычный гость
    if (!cookie || !cookie.includes('cp_refresh=')) {
      return;
    }

    const base = String(useRuntimeConfig(event).apiBase);

    try {
      const me = await $fetch.raw(`${base}/api/auth/me`, { headers: { cookie } });

      if (me.ok) {
        return;
      }
    } catch {
      // Просроченный или битый access — идём обновлять
    }

    try {
      const csrf = getCookie(event, 'cp_csrf');
      const refreshed = await $fetch.raw<{ accessToken?: string }>(
        `${base}/api/auth/refresh`,
        {
          method: 'POST',
          headers: {
            cookie,
            // Без CSRF-заголовка API отвечает 403: токен берём из cookie запроса
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
          },
        },
      );

      if (!refreshed._data?.accessToken) {
        return;
      }

      event.context.freshAccessToken = refreshed._data.accessToken;

      // Свежие access и refresh — браузеру: иначе в cookie останется отозванный
      // токен, и следующее обновление сессии клиент не пройдёт.
      for (const value of setCookieValues(refreshed.headers)) {
        appendResponseHeader(event, 'set-cookie', value);
      }
    } catch {
      // Не получилось — страница отрисуется как гостевая, клиент попробует
      // восстановить сессию ещё раз уже из браузера (см. app.vue).
    }
  });
});
