import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../../features/home/HomePage.vue'
import LoginPage from '../../pages/LoginPage.vue'
import RegisterPage from '../../pages/RegisterPage.vue'
import ProfilePage from '../../pages/ProfilePage.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomePage,
  },
  {
    path: '/insights',
    name: 'Insights',
    component: () => import('../../features/insights/InsightsPage.vue'),
  },
  {
    path: '/checklists',
    name: 'Checklists',
    component: () => import('../../features/checklists/ChecklistsPage.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterPage,
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../../pages/ForgotPasswordPage.vue'),
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('../../pages/ResetPasswordPage.vue'),
  },
  {
    path: '/confirm-email',
    name: 'ConfirmEmail',
    component: () => import('../../pages/EmailConfirmPage.vue'),
  },
  {
    path: '/schedules',
    name: 'Schedules',
    component: () => import('../../pages/SchedulesPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/achievements',
    name: 'Achievements',
    component: () => import('../../pages/AchievementsPage.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const hasToken = !!localStorage.getItem('accessToken')

  if (requiresAuth && !hasToken) {
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && hasToken) {
    next('/schedules')
  } else {
    next()
  }
})

export default router
