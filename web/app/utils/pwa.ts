/**
 * Адрес service worker.
 *
 * В продакшене это собранный `/sw.js`, а в dev `vite-plugin-pwa` отдаёт его
 * по собственному адресу. Логика в одном месте, чтобы регистрация и
 * подписка на push не разъезжались.
 */
export const serviceWorkerUrl = (): string =>
  import.meta.dev ? '/dev-sw.js?dev-sw' : '/sw.js';
