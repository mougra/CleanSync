import { queryCollection } from '@nuxt/content/server';

/**
 * Динамические адреса для карты сайта: статьи и страницы челленджей.
 *
 * Статические маршруты @nuxtjs/sitemap находит сам, а эти перечислить
 * обязательно — иначе материалы, на которые нет ссылок в навигации,
 * поисковик не увидит. `_i18nTransform` размножает адрес по локалям
 * и добавляет hreflang-альтернативы.
 *
 * Юридических документов здесь нет: файл `web/content/legal/privacy.md`
 * живёт в коллекции по адресу `/legal/privacy`, но страницы с таким путём
 * не существует — документ открывается по маршруту `/privacy` (pages/privacy.vue),
 * а этот маршрут статический, и модуль добавляет его сам. Пока в карту
 * попадал `document.path`, в ней висел адрес `/legal/privacy` с ответом 404,
 * и поисковик видел ошибку в карте сайта.
 */
export default defineSitemapEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const articles = await queryCollection(event, 'tips')
    .select('path', 'title', 'publishedAt', 'updatedAt')
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
      /**
       * `lastmod` — дата последней правки: если статью дописали (например,
       * добавили блок вопросов), поисковик должен увидеть это как обновление,
       * а не как старую публикацию. Даты в будущем не ставим (правило 39).
       */
      lastmod: article.updatedAt ?? article.publishedAt ?? undefined,
      _i18nTransform: true,
    })),
    ...challenges.map((challenge) => ({
      loc: `/challenges/${challenge.slug}`,
      _i18nTransform: true,
    })),
  ];
});
