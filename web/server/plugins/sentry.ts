import * as Sentry from '@sentry/node';

/**
 * Мониторинг ошибок на сервере (SSR).
 *
 * Подписываемся на хук ошибок Nitro: сюда попадают падения рендера и запросов.
 * SDK включается только при заданном DSN — без него плагин ничего не делает,
 * поэтому локальная разработка и CI не отправляют события.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig();
  const dsn = String(config.public.sentryDsn ?? '');

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(config.public.sentryTracesSampleRate ?? 0),
  });

  nitroApp.hooks.hook('error', (error) => {
    Sentry.captureException(error);
  });

  nitroApp.hooks.hook('close', async () => {
    // Даём событиям уйти перед остановкой процесса
    await Sentry.close(2000);
  });
});