/**
 * Регистрация service worker.
 *
 * Регистрируем сами: модуль собирает worker (precache + обработчики push),
 * но его встроенная регистрация в текущей версии не подключается к сборке.
 * Адрес отличается в dev и продакшене — см. utils/pwa.ts.
 *
 * В dev не регистрируем вовсе: воркер кэширует статику и отдаёт снимок
 * страницы на навигацию, из-за чего обычное обновление показывало устаревшую
 * разметку, а свежая появлялась только после очистки кэша. Push проверяем на
 * собранном приложении.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' }).catch((error) => {
      console.warn('[pwa] service worker не зарегистрирован:', error);
    });
  });
});
