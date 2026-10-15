const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie, в которое `@nuxtjs/i18n` кладёт выбранный язык.
 * Ключ обязан совпадать с `i18n.detectBrowserLanguage.cookieKey` в nuxt.config.
 */
const LOCALE_COOKIE = 'tidyplan-locale';

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
 * Источник — то же cookie, что читает i18n: выбор человека важнее языка
 * браузера, и на сервере, и в браузере получается одно и то же значение.
 * Если cookie ещё нет (первый заход), SSR отвечает по `Accept-Language`
 * браузера, а клиент — по `navigator.language`.
 */
const apiLocale = (forwardedCookie: string | undefined): string => {
  const fromCookie = cookieValue(
    import.meta.server ? forwardedCookie : document.cookie,
    LOCALE_COOKIE,
  );

  if (fromCookie) {
    return fromCookie;
  }

  if (import.meta.server) {
    return useRequestHeaders(['accept-language'])['accept-language'] ?? 'ru';
  }

  return navigator.language || 'ru';
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

  const request = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
    const method = String(options.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string> | undefined) ?? {}),
      // Язык текстов из базы: интерфейс переводит i18n, а контент — сервер.
      'Accept-Language': apiLocale(forwardedCookie),
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
