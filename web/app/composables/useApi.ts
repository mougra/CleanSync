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

    return await $fetch<T>(`${base}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  };

  return { request };
};
