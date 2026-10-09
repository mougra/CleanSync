import * as Sentry from '@sentry/node';

/**
 * Мониторинг ошибок.
 *
 * Без `SENTRY_DSN` приложение работает как обычно: события никуда не уходят,
 * а ошибки остаются в логах контейнера. Это важно для локальной разработки
 * и CI — там DSN не задаём и не получаем шум от тестовых падений.
 */
const dsn = process.env.SENTRY_DSN ?? '';

export const sentryEnabled = (): boolean => Boolean(dsn);

export const initObservability = (): void => {
  if (!dsn) {
    console.warn('SENTRY_DSN не задан — ошибки будут только в логах контейнера');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_RELEASE,
    // Трассировку включаем частично: полный сэмпл дорог и не нужен на старте
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });

  console.log('Sentry включён');
};

/** Отправить исключение вручную (когда ошибку проглатывает try/catch). */
export const captureError = (error: unknown, context?: Record<string, unknown>): void => {
  if (!dsn) {
    return;
  }

  Sentry.captureException(error, context ? { extra: context } : undefined);
};
