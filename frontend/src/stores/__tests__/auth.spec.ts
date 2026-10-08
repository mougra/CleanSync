import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth';

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('по умолчанию не авторизован', () => {
    const store = useAuthStore();

    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
  });

  it('setAuth сохраняет пользователя и токен в localStorage', () => {
    const store = useAuthStore();

    store.setAuth({ id: '1', email: 'user@example.com' }, 'access-token');

    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('access-token');
    expect(store.user?.email).toBe('user@example.com');
    expect(localStorage.getItem('token')).toBe('access-token');
  });

  it('logout очищает состояние и localStorage', () => {
    const store = useAuthStore();
    store.setAuth({ id: '1', email: 'user@example.com' }, 'access-token');

    store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
