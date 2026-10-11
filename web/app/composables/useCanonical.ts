/**
 * Canonical и og:url страницы.
 *
 * Почему сами, а не через nuxt-seo: модуль ставит canonical тегом низкого
 * приоритета, а `app.vue` отдаёт в `useHead` целиком результат `useLocaleHead()`
 * (нужен для hreflang и lang) — этот вызов перекрывает `link`-теги модуля, и
 * canonical в разметке не появляется вообще. Проверено на собранном приложении:
 * `og:image`, карта сайта и llms.txt домен подставляют, а canonical и og:url нет.
 *
 * Свой тег предсказуем: абсолютный адрес из `site.url` + путь маршрута без
 * query. Английская версия сама получается правильной, потому что её маршрут
 * начинается с `/en`.
 */
export const useCanonical = () => {
  const route = useRoute();
  const site = useSiteConfig();

  const canonical = computed(() => `${String(site.url).replace(/\/+$/, '')}${route.path === '/' ? '/' : route.path.replace(/\/+$/, '')}`);

  useHead({
    link: [{ rel: 'canonical', href: canonical, key: 'canonical' }],
  });

  useSeoMeta({
    ogUrl: canonical,
  });

  return { canonical };
};
