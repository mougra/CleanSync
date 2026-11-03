/**
 * Проактивное продление сессии.
 *
 * Access-cookie живёт 15 минут, и всё это время приложение о ней не думает.
 * Пока вкладка открыта и человек работает, первый же запрос после истечения
 * получал 401 — и только тогда сессия обновлялась (в `useApi`). Если обновление
 * почему-то не проходило, человек оказывался в самом неприятном состоянии:
 * профиль на месте, данные приходят, а действия молча не срабатывают до
 * перезагрузки.
 *
 * Здесь сессия продлевается заранее — раз в 10 минут, пока вкладка видима, и
 * сразу при возврате к ней. 10 < 15, поэтому у работающего приложения access
 * всегда свежий, а 401 остаётся страховкой, а не обычным путём.
 *
 * Скрытая вкладка не продлевается: фоновые запросы на телефоне будят radio, и
 * батарея для этого не повод. Сессия от этого не теряется — refresh-cookie живёт
 * 30 дней, а при возврате к вкладке продление происходит первым делом.
 *
 * Продление идёт на сервер только при живой сессии: гость ничего не запрашивает.
 * Обмен выравнивается в сторе (`refreshSession`), поэтому несколько вкладок и
 * параллельные запросы не мешают друг другу.
 */

/** Период продления: меньше срока access-cookie (15 минут), но не чаще раза в 5. */
const REFRESH_EVERY_MS = 10 * 60 * 1000;

/** Пауза, после которой возврат к вкладке считается поводом обновить сессию. */
const STALE_AFTER_MS = 5 * 60 * 1000;

export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore();

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastRefresh = 0;
  let refreshing = false;

  const isVisible = () => document.visibilityState === 'visible';

  /**
   * Один цикл продления.
   *
   * `force` — вернулись к вкладке или сеть восстановилась: ждать очередных десяти
   * минут незачем, сессия могла истечь за время отсутствия.
   */
  const tick = async (force = false) => {
    if (refreshing || !isVisible() || !auth.isAuthenticated || auth.sessionExpired) {
      return;
    }

    if (!force && Date.now() - lastRefresh < STALE_AFTER_MS) {
      return;
    }

    refreshing = true;
    try {
      await auth.refreshSession();
      lastRefresh = Date.now();
    } finally {
      refreshing = false;
    }
  };

  const start = () => {
    if (timer) {
      return;
    }

    lastRefresh = Date.now();
    timer = setInterval(() => void tick(), REFRESH_EVERY_MS);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Отсчёт начинается после монтирования приложения: до гидратации сессия ещё
  // не известна, а трогать cookie раньше времени незачем.
  nuxtApp.hook('app:mounted', () => void tick(true));

  document.addEventListener('visibilitychange', () => {
    if (isVisible()) {
      void tick(true);
    }
  });

  window.addEventListener('online', () => void tick(true));

  // Вошёл — продлеваем по расписанию; вышел — таймер не нужен.
  watch(
    () => auth.isAuthenticated,
    (authenticated) => {
      if (authenticated) {
        start();
      } else {
        stop();
      }
    },
    { immediate: true },
  );

  // Ушли со страницы — таймер не нужен; вернулись из bfcache — снова продлеваем.
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) {
      return;
    }

    if (auth.isAuthenticated) {
      start();
    }

    void tick(true);
  });
});
