const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
