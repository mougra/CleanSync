/**
 * Регистрация service worker.
 *
 * Регистрируем сами: модуль собирает worker (precache + обработчики push),
 * но его встроенная регистрация в текущей версии не подключается к сборке.
 * Адрес отличается в dev и продакшене — см. utils/pwa.ts.
 */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' }).catch((error) => {
      console.warn('[pwa] service worker не зарегистрирован:', error);
    });
  });
});
