import { queryCollection } from '@nuxt/content/server';

/**
 * llms-full.txt — весь публичный контент одним текстовым файлом.
 *
 * @nuxt/content хранит статьи разобранным деревом, поэтому превращаем его в
 * простой текст: заголовки, списки и абзацы. Форматирование теряется, смысл —
 * нет; модели нужен именно текст.
 */
const nodeToText = (node: unknown): string => {
  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }

  if (typeof node === 'string') {
    return node;
  }

  if (!node || typeof node !== 'object') {
    return '';
  }

  const element = node as { type?: string; tag?: string; value?: string; children?: unknown };

  if (element.type === 'text') {
    return element.value ?? '';
  }

  const inner = nodeToText(element.children);

  switch (element.tag) {
    case 'h1':
      return `\n\n# ${inner}\n`;
    case 'h2':
      return `\n\n## ${inner}\n`;
    case 'h3':
      return `\n\n### ${inner}\n`;
    case 'li':
      return `\n- ${inner}`;
    case 'blockquote':
      return `\n> ${inner}\n`;
    case 'strong':
      return `**${inner}**`;
    case 'em':
      return `_${inner}_`;
    case 'p':
      return `${inner}\n`;
    default:
      return inner;
  }
};

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const base = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  const articles = await queryCollection(event, 'tips').all();

  const sorted = [...articles].sort((left, right) =>
    String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? '')),
  );

  const parts: string[] = [
    '# Clean Planner — полный текст материалов',
    '',
    `Источник: ${base}. Файл собран автоматически из статей раздела «Советы».`,
    `Дата сборки: ${new Date().toISOString().slice(0, 10)}.`,
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

    parts.push('', nodeToText(article.body).replace(/\n{3,}/g, '\n\n').trim(), '');
  }

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');

  return parts.join('\n');
});
