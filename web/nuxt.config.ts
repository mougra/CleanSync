// Nuxt 4 приложение Clean Planner.
//
// Решения, зафиксированные в docs/PLAN.md §0:
//   - SSR/SSG всех публичных страниц, Express-бэкенд переиспользуется как API;
//   - дизайн-токены сняты с макетов (docs/design/mockups) и живут в app/assets/css/tokens.css;
//   - источник статей-инсайтов — MDX в git (@nuxt/content), модуль подключим в Фазе 5.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-08',

  devtools: { enabled: true },

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/fonts',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxt/content',
    '@nuxt/eslint',
    // Фаза 5: '@nuxtjs/seo' (sitemap, robots, og-image)
  ],

  // Статьи и советы — MDX в git: web/content/**. Правятся как обычный контент,
  // не требуют БД и доступны поисковикам как статический HTML.
  content: {
    experimental: {
      /**
       * Встроенный в Node SQLite (node:sqlite, Node 22+) вместо better-sqlite3.
       * Нативный модуль пришлось бы компилировать под Windows, а установочные
       * скрипты пакетов в проекте отключены — WASM-драйвер тоже не подходит,
       * потому что он не умеет писать базу контента.
       */
      sqliteConnector: 'native',
    },
    build: {
      markdown: {
        toc: { depth: 3, searchDepth: 3 },
      },
    },
  },

  // Тема: модуль ставит класс на <html>. classSuffix пустой, чтобы это был ровно
  // `dark` — тот же селектор читает PrimeVue (darkModeSelector).
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storageKey: 'clean-planner-color-mode',
  },

  // Языки: русский по умолчанию (без префикса в URL), английский — /en/...
  // Язык определяется по браузеру и запоминается в cookie.
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'ru',
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    locales: [
      { code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'clean-planner-locale',
      redirectOn: 'root',
      alwaysRedirect: false,
    },
  },

  css: ['primeicons/primeicons.css', '~/assets/css/tokens.css', '~/assets/css/prose.css'],

  // Прокси на Express: относительные /api/... работают так же, как в текущем SPA.
  // В продакшене тот же путь должен обслуживаться реверс-прокси или Nitro routeRules.
  nitro: {
    devProxy: {
      '/api': {
        target: 'http://localhost:5000/api',
        changeOrigin: true,
      },
    },
  },

  runtimeConfig: {
    /**
     * Внутренний адрес Express для запросов во время SSR.
     *
     * Относительный путь на сервере не годится: внутренний $fetch обращается
     * к `http://localhost` без порта и минует devProxy. Браузер же всегда ходит
     * на свой origin (`/api`), потому что httpOnly-cookie работают только
     * в пределах одного origin.
     *
     * Переопределяется переменной окружения NUXT_API_BASE.
     */
    apiBase: 'http://localhost:5000',
    public: {},
  },

  fonts: {
    families: [
      {
        name: 'Onest',
        provider: 'google',
        weights: [400, 500, 600, 700],
        subsets: ['cyrillic', 'latin'],
      },
    ],
  },

  app: {
    head: {
      title: 'Clean Planner',
      titleTemplate: '%s — Clean Planner',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#FEF9F6' },
      ],
    },
  },

  typescript: { strict: true },
})
