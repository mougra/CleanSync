import * as Sentry from '@sentry/vue';

/**
 * Мониторинг ошибок в браузере.
 *
 * Подключаем SDK напрямую, а не модулем `@sentry/nuxt`: модуль тянет
 * build-плагины и растягивал production-сборку с ~1,5 минуты до ~15 минут.
 * Здесь нет ни source maps, ни трассировки сборки — только отлов ошибок,
 * и этого на старте достаточно.
 *
 * Без `NUXT_PUBLIC_SENTRY_DSN` SDK выключен: события никуда не уходят.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const dsn = String(config.public.sentryDsn ?? '');

  if (!dsn) {
    return;
  }

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: import.meta.dev ? 'development' : 'production',
    tracesSampleRate: Number(config.public.sentryTracesSampleRate ?? 0),
  });
});
