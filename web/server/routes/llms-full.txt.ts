import { queryCollection } from '@nuxt/content/server';

/**
 * llms-full.txt — весь публичный контент одним текстовым файлом.
 *
 * @nuxt/content хранит статью в формате minimark: строка JSON вида
 * `{"type":"minimark","value":[["p",{},"текст"],["h2",{},"Заголовок"]]}`.
 * Разворачиваем её в обычный текст — модели нужен текст, а не разметка.
 */

/** minimark: массив, где первый элемент — тег, второй — атрибуты, дальше дети. */
const BLOCK_TAGS: Record<string, (inner: string) => string> = {
  h1: (inner) => `\n\n# ${inner}\n`,
  h2: (inner) => `\n\n## ${inner}\n`,
  h3: (inner) => `\n\n### ${inner}\n`,
  h4: (inner) => `\n\n#### ${inner}\n`,
  p: (inner) => `${inner}\n`,
  li: (inner) => `\n- ${inner}`,
  ul: (inner) => `\n${inner}\n`,
  ol: (inner) => `\n${inner}\n`,
  blockquote: (inner) => `\n> ${inner}\n`,
  pre: (inner) => `\n\`\`\`\n${inner}\n\`\`\`\n`,
  strong: (inner) => `**${inner}**`,
  em: (inner) => `_${inner}_`,
  code: (inner) => `\`${inner}\``,
  br: () => '\n',
  hr: () => '\n---\n',
  table: (inner) => `\n${inner}\n`,
  tr: (inner) => `${inner}\n`,
  td: (inner) => `${inner} | `,
  th: (inner) => `${inner} | `,
};

const minimarkToText = (node: unknown): string => {
  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    const [tag, , ...children] = node as [string, unknown, ...unknown[]];
    const inner = children.map(minimarkToText).join('');
    const render = BLOCK_TAGS[tag];

    return render ? render(inner) : inner;
  }

  if (node && typeof node === 'object') {
    const value = (node as { value?: unknown }).value;

    return value ? minimarkToText(value) : '';
  }

  return '';
};

/** Тело приходит строкой JSON: парсим аккуратно, мусор не должен ломать файл. */
const bodyToText = (body: unknown): string => {
  if (typeof body === 'string') {
    try {
      return minimarkToText(JSON.parse(body));
    } catch {
      return body;
    }
  }

  return minimarkToText(body);
};

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const base = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  const articles = await queryCollection(event, 'tips')
    .select('path', 'title', 'description', 'keywords', 'publishedAt', 'body')
    .all();

  const sorted = [...articles].sort((left, right) =>
    String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? '')),
  );

  const parts: string[] = [
    '# Clean Planner — полный текст материалов',
    '',
    `Источник: ${base}. Файл собран автоматически из статей раздела «Советы».`,
    `Дата сборки: ${new Date().toISOString().slice(0, 10)}. Статей: ${sorted.length}.`,
    '',
  ];

  for (const article of sorted) {
    parts.push('---', '', `# ${article.title}`, '', `URL: ${base}${article.path}`);

    if (article.description) {
      parts.push('', `Кратко: ${article.description}`);
    }

    if (Array.isArray(article.keywords) && article.keywords.length > 0) {
      parts.push('', `Ключевые слова: ${article.keywords.join(', ')}`);
    }

    parts.push('', bodyToText(article.body).replace(/\n{3,}/g, '\n\n').trim(), '');
  }

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');

  return parts.join('\n');
});
