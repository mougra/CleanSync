import type { AuthUser } from '~/types/auth';

const CSRF_COOKIE = 'cp_csrf';

/**
 * Состояние авторизации. Токены в JS не хранятся вообще: access и refresh
 * живут в httpOnly-cookie, а здесь только профиль и CSRF-токен
 * (он не секрет — его читает и клиент, и сервер для double-submit).
 *
 * Все запросы идут относительным путём `/api/...`, то есть через тот же origin,
 * что и приложение: иначе браузер не отправит cookie.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const csrfToken = ref<string | null>(null);
  const ready = ref(false);

  /**
   * Сессия кончилась, а страница этого ещё не показывает.
   *
   * Раньше истёкшая сессия выглядела молчанием: профиль в интерфейсе оставался,
   * а любое действие не срабатывало, пока человек не перезагрузит страницу.
   * Флаг существует не для того, чтобы разлогинить, а чтобы сказать об этом
   * вслух (см. `SessionExpiredNotice`).
   */
  const sessionExpired = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  const readCsrfFromCookie = (): string | null => {
    if (!import.meta.client) {
      return null;
    }
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]+)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  /**
   * Гарантирует наличие CSRF-токена.
   *
   * Источник правды — cookie, а не память: сервер сравнивает присланный заголовок
   * именно с ней. Раньше значение кэшировалось на всю жизнь страницы, и если
   * cookie менялась (или истекала), заголовок расходился с ней — все изменяющие
   * запросы получали 403, а данные и профиль продолжали приходить. Снаружи это
   * выглядело как «нажимаю, и ничего не происходит» до перезагрузки.
   */
  const ensureCsrf = async (): Promise<string> => {
    const fromCookie = readCsrfFromCookie();
    if (fromCookie) {
      csrfToken.value = fromCookie;
      return fromCookie;
    }

    const response = await $fetch<{ csrfToken: string }>('/api/auth/csrf', {
      credentials: 'include',
    });
    csrfToken.value = response.csrfToken;
    return response.csrfToken;
  };

  /** Код ответа из ошибки `$fetch`: ofetch кладёт его в `statusCode` и `response.status`. */
  const statusOf = (error: unknown): number | undefined =>
    (error as { statusCode?: number }).statusCode ??
    (error as { status?: number }).status ??
    (error as { response?: { status?: number } }).response?.status;

  /**
   * Один обмен refresh-токена на новую пару cookie.
   *
   * Возвращает `true`, если сессия жива. 401 означает, что refresh-токен
   * отозван или истёк: тогда поднимаем `sessionExpired` — но только у человека,
   * который считал себя вошедшим, иначе гость с протухшей cookie видел бы
   * предупреждение о чужой сессии.
   */
  const performRefresh = async (): Promise<boolean> => {
    if (!import.meta.client) {
      return false;
    }

    const send = async (token: string) =>
      await $fetch<{ csrfToken?: string }>('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': token },
      });

    try {
      const response = await send(await ensureCsrf());

      // Сервер продлевает CSRF вместе с сессией и отдаёт значение в теле:
      // держим память в согласии с cookie.
      if (response?.csrfToken) {
        csrfToken.value = response.csrfToken;
      }

      sessionExpired.value = false;
      return true;
    } catch (error) {
      /**
       * 403 — расхождение CSRF-токена (устаревшая cookie после долгой паузы).
       * Сессия при этом жива, поэтому пробуем ещё раз: токен выпускаем заново и
       * повторяем обмен. Без этого человек оставался с рабочим профилем, но
       * неработающими кнопками до перезагрузки.
       */
      if (statusOf(error) === 403) {
        try {
          const minted = await $fetch<{ csrfToken: string }>('/api/auth/csrf', {
            credentials: 'include',
          });
          csrfToken.value = minted.csrfToken;

          const retried = await send(minted.csrfToken);

          if (retried?.csrfToken) {
            csrfToken.value = retried.csrfToken;
          }

          sessionExpired.value = false;
          return true;
        } catch (retryError) {
          if (statusOf(retryError) === 401 && user.value) {
            sessionExpired.value = true;
          }

          return false;
        }
      }

      if (statusOf(error) === 401 && user.value) {
        sessionExpired.value = true;
      }

      return false;
    }
  };

  /**
   * Общий на всё приложение обмен refresh-токена.
   *
   * Почему общий: за один тик могут упасть параллельно пять запросов (план дня,
   * статистика, привычки, достижения, челлендж). Без этого промиса каждый пошёл
   * бы обновлять токен сам, а сервер меняет строку в `refresh_tokens` — второй
   * запрос пришёл бы с уже недействительным токеном.
   *
   * Web Locks сериализует обновление между вкладками: вторая заходит в блокировку,
   * когда cookie уже свежая. На случай, если обе всё же успели одновременно,
   * сервер принимает прежний токен ещё две минуты (см. `routes/auth.ts`).
   */
  const REFRESH_LOCK = 'tidyplan-auth-refresh';
  let refreshing: Promise<boolean> | null = null;

  const refreshSession = async (): Promise<boolean> => {
    if (!refreshing) {
      const locks = import.meta.client
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;

      const task = () => performRefresh();

      refreshing = (locks?.request ? locks.request(REFRESH_LOCK, task) : task()).finally(() => {
        refreshing = null;
      });
    }

    return await refreshing;
  };

  const fetchSession = async (): Promise<AuthUser | null> => {
    try {
      const current = await useApi().request<AuthUser>('/api/auth/me');
      user.value = current;
      // Профиль пришёл — значит сессия жива; прежнее предупреждение снимаем.
      sessionExpired.value = false;
    } catch {
      // 401 — обычная ситуация для гостя, это не ошибка приложения.
      user.value = null;
    } finally {
      ready.value = true;
    }
    return user.value;
  };

  /**
   * Сбрасывает кэш `useAsyncData` после смены пользователя.
   *
   * Гость и вошедший — разные ответы на те же ключи (`today-plan`, `calendar-day`,
   * `home-profile`, `my-tasks`). Без сброса после регистрации страница могла
   * показать гостевые данные: план пустой, хотя набор уже создан на сервере.
   */
  const resetCachedData = (): void => {
    if (import.meta.client) {
      clearNuxtData();
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    await ensureCsrf();
    const response = await useApi().request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    user.value = response.user;
    ready.value = true;
    sessionExpired.value = false;
    resetCachedData();
  };

  /**
   * Регистрация. Согласие на обработку персональных данных передаём
   * обязательным полем: сервер без него отвечает 400 и не создаёт аккаунт,
   * а при согласии сохраняет дату (152-ФЗ).
   *
   * Сервер с 27 октября сразу выдаёт cookie-сессию, поэтому регистрация — это
   * вход: профиль кладём в стор, и человек уходит на главную уже авторизованным.
   */
  const register = async (
    email: string,
    password: string,
    acceptTerms: boolean,
  ): Promise<AuthUser | null> => {
    await ensureCsrf();
    const response = await useApi().request<{ user?: AuthUser; message?: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: { email, password, acceptTerms },
      },
    );

    if (response.user) {
      user.value = response.user;
      ready.value = true;
      sessionExpired.value = false;
      resetCachedData();
    }

    return response.user ?? null;
  };

  const logout = async (): Promise<void> => {
    try {
      await ensureCsrf();
      await useApi().request('/api/auth/logout', { method: 'POST' });
    } finally {
      user.value = null;
      sessionExpired.value = false;
      resetCachedData();
    }
  };

  return {
    user,
    csrfToken,
    ready,
    sessionExpired,
    isAuthenticated,
    ensureCsrf,
    refreshSession,
    fetchSession,
    login,
    register,
    logout,
  };
});
