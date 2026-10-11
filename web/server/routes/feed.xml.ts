import { queryCollection } from '@nuxt/content/server';

/**
 * RSS-лента статей.
 *
 * Карта сайта нужна поисковикам, а лента — читалкам, агрегаторам и тем, кто
 * следит за обновлениями. Отдаём стандартный RSS 2.0 на десять свежих статей.
 */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const base = String(config.public.siteUrl ?? '').replace(/\/+$/, '');

  const articles = await queryCollection(event, 'tips')
    .select('path', 'title', 'description', 'publishedAt')
    .all();

  const latest = [...articles]
    .sort((left, right) => String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? '')))
    .slice(0, 10);

  const items = latest
    .map((article) => {
      const url = `${base}${article.path}`;
      const date = article.publishedAt ? new Date(String(article.publishedAt)).toUTCString() : '';

      return [
        '    <item>',
        `      <title>${escapeXml(String(article.title))}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        date ? `      <pubDate>${date}</pubDate>` : '',
        `      <description>${escapeXml(String(article.description ?? ''))}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Clean Planner — советы по уборке</title>
    <link>${escapeXml(base)}/tips</link>
    <description>Статьи о домашней уборке: короткие планы, порядок в комнатах и привычки без выгорания.</description>
    <language>ru-RU</language>
    <atom:link href="${escapeXml(base)}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=1800');

  return xml;
});
