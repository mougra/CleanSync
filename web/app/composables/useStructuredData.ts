/**
 * JSON-LD страницы.
 *
 * Почему не хелперы `defineArticle` / `defineBreadcrumb` / `defineQuestion`:
 * в проекте Unhead v2, а `@unhead/schema-org` ожидает v3 — модуль сам пишет
 * `treeShakeUseSeoMeta requires Unhead v3`, и в HTML попадают только его
 * собственные узлы (WebSite, WebPage, Organization), а вызовы хелперов
 * теряются. Поэтому собираем `@graph` сами: результат предсказуем и не зависит
 * от версии Unhead. Когда Unhead обновится, этот слой можно убрать.
 */
export const useStructuredData = (build: () => Record<string, unknown> | null) => {
  useHead({
    script: [
      {
        type: 'application/ld+json',
        key: 'page-json-ld',
        innerHTML: computed(() => {
          const data = build();

          return data ? JSON.stringify(data) : '';
        }),
      },
    ],
  });
};

/** Абсолютный адрес: поисковики не любят относительные пути в разметке. */
export const useAbsoluteUrl = () => {
  const site = useSiteConfig();

  return (path: string) => (path.startsWith('http') ? path : `${site.url}${path}`);
};
