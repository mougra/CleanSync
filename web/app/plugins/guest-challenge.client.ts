/**
 * Перенос гостевого прогресса челленджей в аккаунт.
 *
 * Гость отмечает задачи челленджа без регистрации: отметки лежат в localStorage
 * (`utils/guestChallenge.ts`). Как только появляется сессия — вход или успешная
 * регистрация — накопленное уходит на сервер, и только после успеха локальная
 * копия стирается. Ошибку не показываем: `syncGuestProgress` пишет её в консоль,
 * а отметки оставляет в браузере, чтобы человек не потерял прогресс.
 *
 * Плагин клиентский: localStorage на сервере нет. Гостевые отметки читаем сами —
 * composable, вызванный на уровне плагина, не имеет инстанса компонента, и его
 * `onMounted` не сработал бы (Vue ругался «no active component instance»).
 * Поэтому инициализация вызывается явно, и обязательно в `app:mounted`: до
 * гидратации прочитанные из localStorage отметки разошлись бы с серверной
 * разметкой. Тот же хук дожидается готовности сессии (обновление страницы
 * вошедшим человеком приходит с сервера в payload), а `watch` ловит вход и
 * регистрацию на этой странице.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore();
  const guest = useGuestChallenge();

  /**
   * `onlyWhenReady` — для первого рендера: пока `fetchSession` не ответил,
   * `isAuthenticated` ещё false, и синхронизировать нечего. Вход и регистрация,
   * наоборот, поднимают `isAuthenticated` в уже готовой сессии.
   */
  const sync = async (onlyWhenReady: boolean) => {
    if (onlyWhenReady && !auth.ready) {
      return;
    }

    if (!auth.isAuthenticated) {
      return;
    }

    await guest.syncGuestProgress();
  };

  nuxtApp.hook('app:mounted', () => {
    // Гидратация гостевого прогресса не должна зависеть от того, вызвал ли
    // composable хоть один компонент: читаем хранилище здесь (идемпотентно).
    guest.initGuestProgress();

    void sync(true);
  });

  watch(
    () => auth.isAuthenticated,
    () => void sync(false),
  );
});
