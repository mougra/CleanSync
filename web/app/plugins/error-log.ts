/**
 * Диагностика ошибок рендера.
 *
 * Зачем: Nuxt в продакшене на ошибку в setup/mount показывает страницу 500, но
 * сам текст ошибки не печатает — `handleVueError` кладёт её в payload и молчит.
 * При серверном рендере причина не попадает вообще никуда: ни в браузер, ни в
 * `docker compose logs web`. Из-за этого падение «без ошибок в консоли» нечем
 * разобрать.
 *
 * Хук пишет ошибку с стеком в консоль процесса: на сервере её видно в логах
 * контейнера web, в браузере — в DevTools. Сообщение помечено `[tidyplan]`,
 * чтобы не путаться с обычными предупреждениями Nuxt.
 */
const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  }

  return String(error);
};

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('vue:error', (error, target, info) => {
    // `info` — место ошибки: setup function, render function, mounted hook…
    console.error(`[tidyplan] vue:error (${info})`, describe(error), target);
  });

  nuxtApp.hook('app:error', (error) => {
    console.error('[tidyplan] app:error', describe(error));
  });
});
