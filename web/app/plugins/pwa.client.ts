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
 *
 * Выключить регистрацию мало: у того, кто уже открывал дев-сервер, воркер
 * остаётся установленным и продолжает перехватывать навигацию — вплоть до
 * страницы «нет подключения к интернету» в браузере, хотя сервер отвечает.
 * Поэтому в разработке снимаем старую регистрацию и чистим её кэши: браузер
 * лечится сам при первой удачной загрузке.
 */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (import.meta.dev) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);

    if ('caches' in window) {
      void caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined);
    }

    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' }).catch((error) => {
      console.warn('[pwa] service worker не зарегистрирован:', error);
    });
  });
});
