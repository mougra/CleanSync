/**
 * Яндекс Метрика.
 *
 * Правила, по которым плагин устроен:
 *  1. **Нет номера — нет счётчика.** `NUXT_PUBLIC_YANDEX_METRIKA_ID` пуст →
 *     скрипт не грузится, в HTML нет ни одного упоминания mc.yandex.ru. Так же
 *     выключен Sentry без DSN; локальная разработка не шлёт визиты в боевой
 *     счётчик.
 *  2. **Нет согласия — нет счётчика.** Метрика — третья сторона с cookie, и по
 *     нашему же баннеру аналитика включается только явным выбором
 *     (`composables/useCookieConsent.ts`). Плагин грузится после согласия и
 *     дозагружается сразу, как человек нажал «Принять аналитику», без
 *     перезагрузки страницы.
 *  3. **SPA-переходы считаются.** У Nitro одна загрузка страницы на много
 *     маршрутов, поэтому на каждый `route.fullPath` отправляется `hit`: без
 *     этого Метрика видела бы только первую страницу визита.
 *
 * `webvisor` выключен осознанно: это запись экрана, а на сайте есть формы входа
 * и личные данные. Включать её — отдельное решение с отдельным согласием.
 */

const TAG_URL = 'https://mc.yandex.ru/metrika/tag.js';

/** Очередь вызовов до загрузки tag.js: `ym` можно звать сразу. */
type YmFunction = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };

const queueCalls = (): YmFunction => {
  const scope = window as unknown as { ym?: YmFunction };

  if (!scope.ym) {
    const queue: YmFunction = (...args: unknown[]) => {
      queue.a?.push(args);
    };

    queue.a = [];
    queue.l = Date.now();
    scope.ym = queue;
  }

  return scope.ym;
};

const loadTag = () => {
  if (document.querySelector(`script[src="${TAG_URL}"]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = TAG_URL;

  document.head.append(script);
};

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const counterId = String(config.public.yandexMetrikaId ?? '').trim();

  if (!counterId) {
    return;
  }

  const { analyticsAllowed, load } = useCookieConsent();
  const route = useRoute();

  let started = false;

  const start = () => {
    if (started || !analyticsAllowed.value) return;

    started = true;

    const ym = queueCalls();

    loadTag();
    ym(counterId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
      trackHash: false,
    });
    ym(counterId, 'hit', route.fullPath, { title: document.title });
  };

  onMounted(() => {
    load();
    start();
  });

  // Согласие можно дать позже, уже на открытой странице.
  watch(analyticsAllowed, (allowed) => {
    if (allowed) start();
  });

  // Переходы внутри приложения: без них в отчёте была бы одна страница визита.
  watch(
    () => route.fullPath,
    (path) => {
      if (!started) return;

      queueCalls()(counterId, 'hit', path, { title: document.title });
    },
  );
});
