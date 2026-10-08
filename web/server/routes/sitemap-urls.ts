import { queryCollection } from '@nuxt/content/server';

/**
 * Динамические адреса для карты сайта: статьи и страницы челленджей.
 *
 * Статические маршруты @nuxtjs/sitemap находит сам, а эти перечислить
 * обязательно — иначе материалы, на которые нет ссылок в навигации,
 * поисковик не увидит. `_i18nTransform` размножает адрес по локалям
 * и добавляет hreflang-альтернативы.
 */
export default defineSitemapEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const articles = await queryCollection(event, 'tips')
    .select('path', 'title', 'publishedAt')
    .all();

  let challenges: Array<{ slug: string }>;
  try {
    challenges = await $fetch<Array<{ slug: string }>>(`${config.apiBase}/api/challenges`);
  } catch {
    // API может быть недоступен на сборке — карта сайта падать не должна.
    challenges = [];
  }

  return [
    ...articles.map((article) => ({
      loc: article.path,
      lastmod: article.publishedAt ?? undefined,
      _i18nTransform: true,
    })),
    ...challenges.map((challenge) => ({
      loc: `/challenges/${challenge.slug}`,
      _i18nTransform: true,
    })),
  ];
});
