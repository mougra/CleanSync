import { queryCollection } from '@nuxt/content/server';

/**
 * llms.txt — карта сайта для языковых моделей (формат llmstxt.org).
 *
 * Смысл файла: дать модели короткий и честный обзор проекта со ссылками на
 * первоисточники, чтобы в ответах цитировали нас, а не пересказ. Поэтому здесь
 * только то, что действительно есть на сайте: статьи, чек-листы, челленджи и
 * справочные страницы.
 *
 * Отдаём обычным текстом без кэша на CDN: контент меняется вместе с сайтом.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const base = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  /**
   * Статьи обеих коллекций: русские (`tips`) и английские (`tipsEn`).
   * Английские лежат по адресам `/en/tips/...`, поэтому в списке для модели
   * они выглядят так же, как обычные ссылки, — но не попадут в файл, если
   * брать только русскую коллекцию.
   */
  const [articles, articlesEn] = await Promise.all([
    queryCollection(event, 'tips').select('path', 'title', 'description', 'publishedAt').all(),
    queryCollection(event, 'tipsEn').select('path', 'title', 'description', 'publishedAt').all(),
  ]);

  const byDate = (list: typeof articles) =>
    [...list].sort((left, right) =>
      String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? '')),
    );

  const sorted = byDate(articles);
  const sortedEn = byDate(articlesEn);

  const lines: string[] = [
    '# TidyPlan',
    '',
    '> TidyPlan — сайт и веб-приложение для домашней уборки: программы-челленджи по дням,',
    '> готовые чек-листы по комнатам, привычки с напоминаниями, статистика и семейный план.',
    '> Интерфейс на русском, английская версия — на /en.',
    '',
    'Ключевое:',
    `- Домен: ${base}`,
    '- Языки: русский (основной), английский на /en',
    '- Бесплатно, без рекламы и без регистрации для чтения статей',
    '- Публичные разделы: главная, советы, чек-листы, челленджи',
    '- Личные разделы (нужен вход, закрыты от индексации): привычки, статистика, дом и семья',
    '',
    '## Основное',
    '',
    `- [Главная](${base}/): план дня, активный челлендж, привычки и совет дня`,
    `- [Советы](${base}/tips): статьи о домашней уборке — по одной теме на материал`,
    `- [Чек-листы](${base}/checklists): готовые списки дел по комнатам, можно скопировать себе`,
    `- [Челленджи](${base}/challenges): программы уборки по дням с задачами и оценкой времени`,
    '',
    '## Статьи',
    '',
    ...sorted.map((article) => `- [${article.title}](${base}${article.path}): ${article.description ?? ''}`),
    '',
    '## Статьи (English)',
    '',
    ...sortedEn.map((article) => `- [${article.title}](${base}${article.path}): ${article.description ?? ''}`),
    '',
    '## Справочное',
    '',
    `- [Как пользоваться приложением](${base}/guide): короткая инструкция по разделам`,
    `- [О проекте](${base}/about): зачем сделан TidyPlan и как он устроен`,
    `- [Контакты](${base}/contacts): почта для вопросов и предложений`,
    `- [Частые вопросы](${base}/faq): ответы про регистрацию, данные и планы`,
    `- [Политика конфиденциальности](${base}/privacy): какие данные собираем и как удалить`,
    '',
    '## Необязательное',
    '',
    `- [Полный текст статей](${base}/llms-full.txt): все статьи одним файлом для обработки моделью`,
    `- [RSS](${base}/feed.xml): лента новых статей`,
    '',
  ];

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');

  return lines.join('\n');
});
