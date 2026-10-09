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

  const isAuthenticated = computed(() => user.value !== null);

  const readCsrfFromCookie = (): string | null => {
    if (!import.meta.client) {
      return null;
    }
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]+)`));
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  /** Гарантирует наличие CSRF-токена: из cookie, иначе запрашивает у API. */
  const ensureCsrf = async (): Promise<string> => {
    if (csrfToken.value) {
      return csrfToken.value;
    }

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

  const fetchSession = async (): Promise<AuthUser | null> => {
    try {
      const current = await useApi().request<AuthUser>('/api/auth/me');
      user.value = current;
    } catch {
      // 401 — обычная ситуация для гостя, это не ошибка приложения.
      user.value = null;
    } finally {
      ready.value = true;
    }
    return user.value;
  };

  const login = async (email: string, password: string): Promise<void> => {
    await ensureCsrf();
    const response = await useApi().request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    user.value = response.user;
    ready.value = true;
  };

  /**
   * Регистрация. Согласие на обработку персональных данных передаём
   * обязательным полем: сервер без него отвечает 400 и не создаёт аккаунт,
   * а при согласии сохраняет дату (152-ФЗ).
   */
  const register = async (
    email: string,
    password: string,
    acceptTerms: boolean,
  ): Promise<string> => {
    await ensureCsrf();
    const response = await useApi().request<{ message?: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, acceptTerms },
    });
    return response.message ?? '';
  };

  const logout = async (): Promise<void> => {
    try {
      await ensureCsrf();
      await useApi().request('/api/auth/logout', { method: 'POST' });
    } finally {
      user.value = null;
    }
  };

  return { user, csrfToken, ready, isAuthenticated, ensureCsrf, fetchSession, login, register, logout };
});
