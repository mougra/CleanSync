import { defineStore } from 'pinia';
import type { User } from '../../../shared/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: localStorage.getItem('token') || null,
    isAuthenticated: !!localStorage.getItem('token'),
  }),

  actions: {
    setAuth(user: User, token: string) {
      this.user = user;
      this.token = token;
      this.isAuthenticated = true;
      localStorage.setItem('token', token);
    },
    logout() {
      this.user = null;
      this.token = null;
      this.isAuthenticated = false;
      localStorage.removeItem('token');
    }
  },

  getters: {
    getToken: (state): string | null => state.token,
  }
});
