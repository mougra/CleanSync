import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    accessToken: localStorage.getItem('accessToken') || null,
    isAuthDialogOpen: false,
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    userName: (state) => state.user?.email || '',
  },
  actions: {
    setToken(token) {
      this.accessToken = token
      localStorage.setItem('accessToken', token)
    },
    setUser(user) {
      this.user = user
      if (user?.email) {
        localStorage.setItem('userName', user.email)
      }
    },
    openAuthDialog() {
      this.isAuthDialogOpen = true
    },
    closeAuthDialog() {
      this.isAuthDialogOpen = false
    },
    logout() {
      this.user = null
      this.accessToken = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('userName')
    },
    async login(payload) {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка входа')
      }
      this.setToken(data.accessToken)
      this.setUser(data.user)
      this.closeAuthDialog()
      return data
    },
    async register(payload) {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка регистрации')
      }
      return data
    },
  },
})
