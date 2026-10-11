import { getCookie, getHeader } from 'h3';

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
 * Своих cookie браузеру не ставим: это сделает сам API, когда клиент обратится
 * к нему напрямую. Здесь важно лишь, чтобы текущий рендер видел пользователя.
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
      const refreshed = await $fetch<{ accessToken?: string }>(`${base}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          cookie,
          // Без CSRF-заголовка API отвечает 403: токен берём из cookie запроса
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
      });

      if (refreshed?.accessToken) {
        event.context.freshAccessToken = refreshed.accessToken;
      }
    } catch {
      // Не получилось — страница отрисуется как гостевая, клиент дозагрузит сессию
    }
  });
});
