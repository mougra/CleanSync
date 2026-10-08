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
    '@nuxtjs/seo',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
  ],

  /**
   * SEO-фундамент: canonical, og-теги, sitemap, robots, schema.org.
   * `site.url` — база для canonical и карты сайта; в продакшене задаётся
   * переменной NUXT_PUBLIC_SITE_URL (тот же домен, что у API: cookie
   * ходят только внутри одного origin).
   */
  seo: {
    // Проверка дублей в head ругается на значения, которые Nuxt ставит сам
    // (charset, viewport, og:type) — слушать это на каждой сборке бессмысленно.
    validateAppHead: false,
  },

  site: {
    url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    name: 'Clean Planner',
    description:
      'Челленджи уборки по дням, полезные привычки и советы — чтобы навести порядок дома без выгорания.',
    defaultLocale: 'ru',
  },

  /**
   * PWA: установка на домашний экран и push-напоминания.
   * Берём injectManifest, а не generateSW: нужен свой service worker
   * с обработчиками push и notificationclick.
   */
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    injectManifest: {
      // Кэшируем только статику. Ответы API и HTML не трогаем: там данные
      // пользователя, и устаревший кэш опаснее отсутствия офлайна.
      globPatterns: ['**/*.{js,css,woff2,png,svg,jpg,ico,webmanifest}'],
    },
    manifest: {
      name: 'Clean Planner',
      short_name: 'Clean Planner',
      description:
        'Челленджи уборки по дням, полезные привычки и советы — порядок дома без выгорания.',
      lang: 'ru',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#FEF9F6',
      theme_color: '#2F6B58',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    // В dev service worker тоже нужен: без него не проверить подписку на push.
    devOptions: { enabled: true, type: 'module', navigateFallback: '/' },
  },

  sitemap: {
    /**
     * Динамические адреса (статьи, страницы челленджей) отдаёт свой источник.
     * Путь намеренно НЕ под /api: и devProxy, и боевой реверс-прокси уводят
     * весь /api в Express, и маршрут Nitro там был бы недоступен.
     */
    sources: ['/sitemap-urls'],
    // Служебные и закрытые страницы в карту не попадают.
    exclude: [
      '/dev/**',
      '/login',
      '/register',
      '/confirm-email',
      '/reset-password',
      '/forgot-password',
      '/settings',
    ],
  },

  robots: {
    // Служебное и личное закрываем. API не индексируется сам по себе (JSON без
    // ссылок), а disallow на /api у nuxt-seo вызывает предупреждение.
    disallow: ['/dev', '/settings'],
  },

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

    /**
     * @nuxt/content помечает свой клиентский SQL-дамп (`/__nuxt_content/**`)
     * как prerender-маршрут, но в prerender-контексте его обработчик падает:
     * `@nuxtjs/seo` приносит в дерево h3 2.x, и она перекрывает h3 1.x, на
     * которой работает Nitro из Nuxt 4.4.8 (`getNitroOrigin` → 500).
     * Деплой у нас серверный (SSR в Docker), поэтому маршрут спокойно остаётся
     * динамическим: страницы контента отдаются сервером и без пререндера.
     */
    prerender: {
      ignore: ['/__nuxt_content/**'],
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
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      meta: [
        // viewport Nuxt ставит сам — не дублируем.
        { name: 'theme-color', content: '#FEF9F6' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Clean Planner' },
      ],
    },
  },

  typescript: { strict: true },
})
