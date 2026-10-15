// Nuxt 4 приложение TidyPlan.
//
// Зафиксированные решения:
//   - SSR/SSG всех публичных страниц, Express-бэкенд переиспользуется как API;
//   - дизайн-токены живут в app/assets/css/tokens.css (сняты с утверждённых макетов);
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
   * Sentry подключается напрямую через SDK, а не модулем `@sentry/nuxt`:
   * модуль тянет build-плагины и растягивал production-сборку с полутора минут
   * до пятнадцати. Оба обработчика включаются переменной NUXT_PUBLIC_SENTRY_DSN —
   * см. app/plugins/sentry.client.ts и server/plugins/sentry.ts.
   */
  seo: {
    // Проверка дублей в head ругается на значения, которые Nuxt ставит сам
    // (charset, viewport, og:type) — слушать это на каждой сборке бессмысленно.
    validateAppHead: false,
  },

  site: {
    url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    name: 'TidyPlan',
    description:
      'TidyPlan — бесплатный план уборки дома: челленджи по дням, привычки и советы, чтобы наводить порядок без выгорания.',
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
      // Источник правды для прода. В dev этот объект не собирается (см.
      // devOptions ниже), и тот же JSON лежит готовым файлом в
      // public/manifest.webmanifest — при правке одного правьте оба.
      // Английская версия — public/manifest.en.webmanifest: её подставляет
      // app.vue, когда язык интерфейса английский (в манифесте живут описание
      // и названия ярлыков, а они должны быть на языке интерфейса).
      //
      // `id` фиксирует личность приложения: без него Chrome считает ей start_url,
      // и смена start_url однажды поставит вторую копию приложения рядом с первой.
      id: '/',
      name: 'TidyPlan',
      short_name: 'TidyPlan',
      description:
        'План уборки по дням, привычки и советы — порядок дома без выгорания.',
      lang: 'ru',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#FEF9F6',
      theme_color: '#2F6B58',
      categories: ['lifestyle', 'productivity', 'health'],
      // Магазина у нас нет: приложение ставится из браузера, а не из стора.
      prefer_related_applications: false,
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
      // Ярлыки появляются по долгому нажатию на иконку приложения.
      shortcuts: [
        {
          name: 'Сегодня',
          short_name: 'Сегодня',
          url: '/',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
        {
          name: 'Привычки',
          short_name: 'Привычки',
          url: '/habits',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
        {
          name: 'Чек-листы',
          short_name: 'Чек-листы',
          url: '/checklists',
          icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
        },
      ],
    },
    /*
     * В dev service worker выключен осознанно.
     *
     * Раньше здесь стояло `enabled: true` с `navigateFallback: '/'` — и это
     * ломало разработку: на обычное обновление (F5) воркер отдавал
     * закэшированный снимок главной вместо свежего серверного рендера. Снимок
     * мог быть отрисован для гостя, поэтому пропадали блоки, зависящие от
     * сессии (например, привычки), а вёрстка выглядела «поехавшей» — до первого
     * жёсткого обновления с очисткой кэша. Плюс precache в dev отдавал старые
     * JS-чанки, из-за чего гидрация расходилась с разметкой.
     *
     * Push-уведомления проверяем на собранном приложении:
     * `npm run build && node .output/server/index.mjs`.
     *
     * Манифест в dev отдаётся статикой: public/manifest.webmanifest (содержимое
     * повторяет объект `manifest` выше). Отдельной опции «манифест без service
     * worker» у @vite-pwa/nuxt 1.1.1 / vite-plugin-pwa 1.3.0 нет: в dev манифест
     * собирается только при `devOptions.enabled: true` (см. проверку
     * `devEnvironment && !devOptions.enabled` в vite-plugin-pwa), а этот флаг
     * включает и dev-воркер. Ссылка `<link rel="manifest">` живёт в app.head
     * и без файла давала 404 в консоли.
     *
     * В проде статика модулю не мешает: `buildDir/manifests` модуль кладёт
     * в `nitro.publicAssets` раньше, чем лишний `public/` (Nuxt дописывает
     * каталоги слоёв в конец массива), а Nitro при копировании пропускает файл,
     * который в выходном каталоге уже есть, — в сборку уходит манифест,
     * собранный модулем из конфига выше. Даже если порядок когда-нибудь
     * изменится, оба файла описывают один и тот же манифест.
     */
    devOptions: { enabled: false },
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
      '/analytics',
      '/achievements',
    ],
  },

  robots: {
    /**
     * Служебное и личное закрываем: приватные страницы не должны попадать
     * в выдачу, даже если на них когда-нибудь появится ссылка.
     *
     * `/api` не перечисляем: JSON не индексируется сам по себе, а disallow
     * на него вызывает предупреждение nuxt-seo.
     */
    disallow: [
      '/dev',
      '/settings',
      '/household',
      '/analytics',
      '/achievements',
      '/guide',
      '/login',
      '/register',
      '/confirm-email',
      '/reset-password',
      '/forgot-password',
    ],
    // Страницы с noindex перечислены выше вручную: автоматический режим
    // (disallowNonIndexableRoutes) добавлял в robots.txt ещё и /_nuxt/**,
    // а без своих скриптов и стилей поисковик не отрисует страницу.
    //
    // Политику для AI-краулеров (Content-Signal из черновика IETF aipref) этот
    // модуль умеет только хуком `robots:config`, а он не описан в типах NuxtHooks
    // — typecheck такое не пропускает. Политику выражаем иначе и честно:
    // robots.txt никого не блокирует (краулеры допущены), а llms.txt прямо
    // говорит, что материалы открыты для обучения и ответов.
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
  //
  // storage: 'cookie' — не косметика, а условие совпадения разметки сервера и
  // клиента. По умолчанию модуль пишет выбор в localStorage: на сервере его нет,
  // и SSR рисовал `preference: 'system'` («Как в системе»), а клиент после
  // чтения хранилища — сохранённую тему. Vue ругался на hydration mismatch
  // иконки, подписи и title у переключателя темы. С cookie серверный плагин
  // модуля (dist/runtime/plugin.server) читает тот же выбор из cookie, что и
  // инлайновый скрипт в браузере, поэтому первый рендер совпадает.
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storage: 'cookie',
    storageKey: 'tidyplan-color-mode',
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
      cookieKey: 'tidyplan-locale',
      redirectOn: 'root',
      alwaysRedirect: false,
    },
  },

  css: [
    'primeicons/primeicons.css',
    '~/assets/css/tokens.css',
    '~/assets/css/decor.css',
    '~/assets/css/prose.css',
  ],

  // Прокси на Express: относительные /api/... работают так же, как в прежнем SPA.
  // В продакшене тот же путь обслуживает реверс-прокси (см. Caddyfile).
  //
  // Адрес API настраивается: при запуске на хосте это localhost:5000,
  // а в режиме разработки через Docker — сервис `backend` внутри compose
  // (docker-compose.dev.yml задаёт NUXT_DEV_PROXY_TARGET).
  nitro: {
    devProxy: {
      '/api': {
        target: `${process.env.NUXT_DEV_PROXY_TARGET ?? 'http://localhost:5000'}/api`,
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
    public: {
      /**
       * Публичный адрес сайта. Нужен серверным маршрутам (llms.txt, feed.xml,
       * sitemap), чтобы собирать абсолютные ссылки; в проде приходит из
       * NUXT_PUBLIC_SITE_URL.
       */
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      /**
       * Пояс приложения: им определяется, какой календарный день считается
       * сегодняшним. Должен совпадать с `APP_TIME_ZONE` на бэкенде (по умолчанию
       * Москва), иначе после местной полуночи экран и сервер разойдутся в дате,
       * и отметка уйдёт не на тот день.
       */
      appTimeZone: process.env.APP_TIME_ZONE || 'Europe/Moscow',
      // Пусто = мониторинг выключен (значения приходят из окружения:
      // NUXT_PUBLIC_SENTRY_DSN и NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
      sentryDsn: '',
      sentryTracesSampleRate: 0.1,
    },
  },

  /**
   * Данные об организации для микроразметки: узел Organization в @graph на всех
   * страницах. Почта и логотип помогают поисковикам связать сайт с проектом.
   */
  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'TidyPlan',
      logo: '/icons/icon-512.png',
      email: 'tidyflowup@gmail.com',
    },
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
      title: 'TidyPlan',
      titleTemplate: '%s — TidyPlan',
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
        // Ссылку на манифест ставит app.vue: адрес зависит от языка интерфейса
        // (у русского и английского манифеста разные описание и ярлыки).
      ],
      meta: [
        // viewport Nuxt ставит сам — не дублируем.
        { name: 'theme-color', content: '#FEF9F6' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'TidyPlan' },
      ],
    },
  },

  typescript: { strict: true },
})
