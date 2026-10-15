import { defineCollection, defineContentConfig, z } from '@nuxt/content';

/**
 * Контент сайта: статьи-советы в web/content/tips/*.md.
 *
 * Схема обязательна — если в front-matter опечатка в поле, сборка упадёт
 * с понятной ошибкой, а не отдаст пустую карточку.
 *
 * ВАЖНО: значение с двоеточием в front-matter берём в кавычки
 * (`title: "Окна без разводов: порядок"`). Без кавычек YAML прочитает строку
 * как вложенный объект, и в базу попадёт `[object Object]`.
 */
/**
 * Схема статьи-совета. Одна на оба языка: английский перевод обязан повторять
 * структуру русского оригинала, и расхождение ловится здесь, а не на странице.
 */
const tipSchema = z.object({
  title: z.string(),
  description: z.string(),
  cover: z.string(),
  category: z.enum(['home', 'kitchen', 'bathroom', 'habits', 'planning', 'family', 'pets']),
  icon: z.string().default('pi-lightbulb'),
  minutes: z.number().int().positive().default(10),
  publishedAt: z.string(),
  order: z.number().int().default(100),
  /** Дата обновления: нужна в разметке статьи (dateModified) и в карте сайта. */
  updatedAt: z.string().optional(),
  /** Ключевые фразы статьи: уходят в keywords и в разметку. */
  keywords: z.array(z.string()).default([]),
  /**
   * Частые вопросы по теме статьи. Отдаём их в микроразметке FAQPage —
   * это шанс попасть в блок «Люди также спрашивают».
   */
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
});

export default defineContentConfig({
  collections: {
    tips: defineCollection({
      type: 'page',
      source: 'tips/*.md',
      schema: tipSchema,
    }),

    /**
     * Английские статьи: те же слаги в `content/en/tips/*.md`.
     *
     * Отдельная коллекция, а не общая с `locale` в front-matter: так советует
     * сам @nuxt/content (в этой версии нет опции `locales`), и заодно ничего не
     * стоит добавить третий язык.
     *
     * `prefix` не задаём намеренно: путь статьи получается `/en/tips/<slug>` —
     * ровно адрес страницы в английской локали (`localePath('/tips/<slug>')`).
     * Поэтому страница ищет статью по текущему `route.path`, а не собирает путь
     * из слага вручную.
     */
    tipsEn: defineCollection({
      type: 'page',
      source: 'en/tips/*.md',
      schema: tipSchema,
    }),

    /**
     * Юридические документы. Реквизиты оператора — в front-matter: их нужно
     * заполнить перед публикацией, и лучше в одном месте, чем по тексту.
     */
    legal: defineCollection({
      type: 'page',
      source: 'legal/*.md',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        updatedAt: z.string(),
        operator: z.object({
          status: z.string(),
          name: z.string(),
          inn: z.string(),
          email: z.string(),
          address: z.string(),
        }),
      }),
    }),
  },
});
