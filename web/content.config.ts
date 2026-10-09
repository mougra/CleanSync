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
export default defineContentConfig({
  collections: {
    tips: defineCollection({
      type: 'page',
      source: 'tips/*.md',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        cover: z.string(),
        category: z.enum(['home', 'kitchen', 'bathroom', 'habits', 'planning', 'family', 'pets']),
        icon: z.string().default('pi-lightbulb'),
        minutes: z.number().int().positive().default(10),
        publishedAt: z.string(),
        order: z.number().int().default(100),
      }),
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
