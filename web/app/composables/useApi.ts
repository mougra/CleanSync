const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie, в которое `@nuxtjs/i18n` кладёт выбранный язык.
 * Ключ обязан совпадать с `i18n.detectBrowserLanguage.cookieKey` в nuxt.config.
 */
const LOCALE_COOKIE = 'tidyplan-locale';

/**
 * Английская версия живёт под префиксом `/en`, у русского (языка по умолчанию)
 * префикса нет. Тот же признак читают навигация (`appPath`) и карта сайта.
 */
const EN_PATH = /^\/en(?=\/|$)/;

const pathLocale = (path: string): string | null =>
  EN_PATH.test(path.split('?')[0] ?? '') ? 'en' : null;

/** Значение cookie без зависимостей от Nuxt: нужно и в SSR, и в браузере. */
const cookieValue = (raw: string | undefined, name: string): string | null => {
  if (!raw) {
    return null;
  }

  for (const part of raw.split(';')) {
    const [key, ...rest] = part.split('=');

    if (key?.trim() === name) {
      const value = rest.join('=').trim();

      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
};

/**
 * Язык, на котором API должен отдать тексты из базы (названия челленджей,
 * достижений, привычек). Интерфейс переводят i18n на клиенте, а этот текст
 * приходит готовой строкой с сервера, поэтому язык едет в каждом запросе.
 *
 * На сервере язык задаёт адрес страницы: `/en/...` i18n рендерит по-английски,
 * остальные адреса — по-русски. Брать его из cookie или `Accept-Language`
 * нельзя: страница `/en/tips`, открытая по прямой ссылке (cookie ещё нет,
 * браузер русский), получала английский интерфейс с русскими названиями из базы.
 *
 * В браузере — cookie: `i18n` держит его равным языку открытой страницы, а сам
 * `useApi()` создаётся один раз и переживает смену языка. Читаем значение
 * на момент запроса, а не при создании: переключатель пишет cookie раньше,
 * чем уходит запрос за новыми текстами.
 */
const apiLocale = (requestPath: string): string => {
  if (import.meta.server) {
    return pathLocale(requestPath) ?? 'ru';
  }

  return cookieValue(document.cookie, LOCALE_COOKIE) ?? (navigator.language || 'ru');
};

/** Тип опций берём у самого $fetch, чтобы не расходиться с версией Nitro. */
type ApiRequestOptions = Parameters<typeof $fetch>[1];

/** 401 приходит от API, когда access-cookie просрочена. */
const isUnauthorized = (error: unknown): boolean => {
  const status =
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status ??
    (error as { response?: { status?: number } }).response?.status;

  return status === 401;
};

/**
 * Общий на всё приложение запрос обновления сессии.
 *
 * Почему общий: за один тик могут упасть параллельно пять запросов (план дня,
 * статистика, привычки, достижения, челлендж). Без этого промиса каждый пошёл бы
 * обновлять токен сам, а сервер меняет строку в `refresh_tokens` — второй запрос
 * пришёл бы с уже недействительным токеном и «разлогинил» бы человека.
 */
let refreshing: Promise<boolean> | null = null;

/**
 * Обёртка над $fetch для обращений к нашему API.
 *
 * Зачем она нужна:
 * 1. В браузере запросы идут относительным путём `/api/...`, то есть на свой
 *    origin — обязательное условие для httpOnly-cookie. Серверный (SSR) запрос
 *    наоборот обязан идти на внутренний адрес API: внутренний $fetch не знает
 *    про порт dev-сервера и минует прокси.
 * 2. При SSR cookie браузера не отправляются сами: их нужно пробросить
 *    из входящего запроса.
 * 3. Для изменяющих запросов подставляется CSRF-заголовок (double-submit).
 */
export const useApi = () => {
  const auth = useAuthStore();
  const config = useRuntimeConfig();

  const isServer = import.meta.server;
  const base = isServer ? String(config.apiBase) : '';
  // Заголовки входящего запроса забираем синхронно: дальше контекст может потеряться.
  const forwardedCookie = isServer ? useRequestHeaders(['cookie']).cookie : undefined;
  /**
   * Свежий access-токен, если серверный плагин `restore-session` успел обновить
   * сессию до рендера: тогда вместо просроченного токена в cookie едет новый.
   */
  const restoredAccessToken = isServer
    ? (useRequestEvent()?.context as { freshAccessToken?: string } | undefined)?.freshAccessToken
    : undefined;
  /**
   * Адрес текущей страницы: на сервере он и задаёт язык текстов из базы
   * (см. `apiLocale`). Запоминаем сразу — внутри `request` контекст запроса
   * уже может быть недоступен.
   */
  const requestPath = isServer ? (useRequestEvent()?.path ?? '') : '';

  /**
   * Обновить сессию один раз на всех.
   *
   * Возвращает `true`, если токен обновился и запрос стоит повторить. Ошибку не
   * пробрасываем: неудачное обновление — это «гость», а не падение страницы.
   */
  const refreshSession = async (csrf: string): Promise<boolean> => {
    if (!refreshing) {
      refreshing = $fetch(`${base}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf, 'Accept-Language': apiLocale(requestPath) },
      })
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          refreshing = null;
        });
    }

    return await refreshing;
  };

  const request = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
    const method = String(options.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string> | undefined) ?? {}),
      // Язык текстов из базы: интерфейс переводит i18n, а контент — сервер.
      'Accept-Language': apiLocale(requestPath),
    };

    if (!SAFE_METHODS.has(method)) {
      headers['X-CSRF-Token'] = await auth.ensureCsrf();
    }

    if (forwardedCookie) {
      headers.cookie =
        restoredAccessToken && forwardedCookie.includes('cp_access=')
          ? mergeAccessCookie(forwardedCookie, restoredAccessToken)
          : forwardedCookie;
    }

    const send = () =>
      $fetch<T>(`${base}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });

    try {
      return await send();
    } catch (error) {
      /**
       * Access-токен живёт 15 минут, и в открытой вкладке или установленной PWA
       * обновлять его было некому: `/api/auth/refresh` вызывала только серверная
       * обёртка при полной загрузке страницы. Через 15 минут первый же запрос
       * получал 401, а стор выставлял `user = null` — человек «вылетал» из
       * аккаунта, хотя refresh-cookie жива.
       *
       * Здесь обновляем сессию и повторяем запрос ровно один раз. Маршруты
       * `/api/auth/*` исключены: у них своя логика ответа на 401, и повторять
       * туда запрос нельзя — цикл.
       */
      if (isServer || path.startsWith('/api/auth/') || !isUnauthorized(error)) {
        throw error;
      }

      const refreshed = await refreshSession(headers['X-CSRF-Token'] ?? (await auth.ensureCsrf()));

      if (!refreshed) {
        throw error;
      }

      return await send();
    }
  };

  return { request };
};
