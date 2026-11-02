#!/usr/bin/env node
/**
 * IndexNow: сообщаем Яндексу и Bing об изменённых адресах.
 *
 * Зачем отдельный скрипт, а не то, что «само»: IndexNow — это HTTP-запрос,
 * а не файл. Пока ключ опубликован, но никто его не вызывает, поисковик узнаёт
 * о новых статьях только из карты сайта, то есть через дни. Скрипт берёт
 * адреса из боевой карты сайта и отправляет пачку после деплоя.
 *
 * Порядок:
 *   1. `npm run build` и деплой — ключ должен быть уже доступен;
 *   2. `npm run indexnow` (можно локально, доступ к сайту не нужен).
 *
 * Ключ лежит файлом `web/public/<ключ>.txt` — по протоколу имя файла и есть
 * ключ, а содержимое обязано с ним совпадать. Поэтому ключ здесь не задаётся
 * вручную: скрипт находит файл сам, чтобы не разъехались имя и содержимое.
 *
 * Google IndexNow не поддерживает — это Яндекс, Bing и ещё несколько поисков.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'web/public');

/** Эндпоинты: api.indexnow.org раздаёт запрос всем партнёрам, Яндекс — себе. */
const ENDPOINTS = ['https://api.indexnow.org/indexnow', 'https://yandex.com/indexnow'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const siteArg = args.find((arg) => arg.startsWith('--site='));
const site = (siteArg ? siteArg.slice('--site='.length) : process.env.SITE_URL || 'https://tidyplan.ru')
  .replace(/\/+$/, '');

/** Ключ: ровно один файл вида `<32 hex>.txt` в public. */
const findKey = () => {
  const candidates = readdirSync(PUBLIC_DIR).filter((name) => /^[a-f0-9]{32}\.txt$/.test(name));

  if (candidates.length !== 1) {
    throw new Error(
      `В web/public должен лежать ровно один ключ IndexNow (<32 hex>.txt), найдено: ${candidates.length}`,
    );
  }

  const key = candidates[0].replace(/\.txt$/, '');
  const content = readFileSync(join(PUBLIC_DIR, candidates[0]), 'utf8').trim();

  if (content !== key) {
    throw new Error(`Содержимое ${candidates[0]} не совпадает с именем файла — IndexNow ответит 403`);
  }

  return key;
};

/** Все адреса из карты сайта: индекс → вложенные карты. */
const collectUrls = async () => {
  const fetchText = async (url) => {
    const response = await fetch(url, { headers: { 'user-agent': 'TidyPlan-IndexNow/1.0' } });
    if (!response.ok) throw new Error(`${url} → ${response.status}`);
    return response.text();
  };

  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());

  const index = await fetchText(`${site}/sitemap.xml`);
  const urls = [];

  for (const child of locs(index)) {
    // Карта сайта — это либо индекс, либо сразу список адресов.
    const xml = await fetchText(child);
    const entries = locs(xml);
    const own = entries.filter((url) => !url.endsWith('.xml'));
    urls.push(...(own.length > 0 ? own : []));
  }

  return [...new Set([...urls, ...locs(index).filter((url) => !url.endsWith('.xml'))])];
};

const submit = async (endpoint, payload) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  // 200/202 — принято; 403 — ключ не найден на сайте; 422 — ключ/адреса не совпали.
  const note = response.ok ? 'принято' : `ошибка ${response.status}`;
  console.log(`${endpoint}: ${note}`);
  return response.ok;
};

const main = async () => {
  const key = findKey();
  const urls = await collectUrls();
  const keyLocation = `${site}/${key}.txt`;

  console.log(`Ключ: ${key}`);
  console.log(`Адресов: ${urls.length}`);

  if (dryRun) {
    console.log(urls.slice(0, 5).join('\n'));
    console.log('...');
    return;
  }

  // Больше 10 000 адресов за запрос протокол не принимает — бьём на пачки.
  const chunkSize = 10000;
  let failed = 0;

  for (let offset = 0; offset < urls.length; offset += chunkSize) {
    const payload = {
      host: new URL(site).host,
      key,
      keyLocation,
      urlList: urls.slice(offset, offset + chunkSize),
    };

    for (const endpoint of ENDPOINTS) {
      try {
        const ok = await submit(endpoint, payload);
        if (!ok) failed += 1;
      } catch (error) {
        failed += 1;
        console.error(`${endpoint}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  if (failed > 0) {
    console.error(
      'Часть запросов не прошла. Проверьте, что ключ уже отдан сайтом: ' +
        `curl ${keyLocation}`,
    );
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
