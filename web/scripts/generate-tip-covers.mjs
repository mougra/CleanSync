import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Собирает обложки статей-советов из 24 разных фотографий — по одной на тему.
 *
 * Зачем: раньше обложек было всего четыре, и каждая статья брала свой кадр одного
 * и того же фото. В сетке это читалось как повтор: «окно», «ванная» и «полы»
 * оказывались разными окнами одного интерьера. Теперь у каждой статьи свой
 * исходник (`public/photos/tips-src/<slug>.jpg`, свободные фото Burst), а скрипт
 * только приводит его к 1200×630, добавляет тонировку по категории и плашку с
 * иконкой. Тематические фото берутся с бесплатной лицензией Burst (Shopify):
 * коммерческое использование и изменение разрешены, атрибуция не обязательна.
 *
 * Запуск: `node scripts/generate-tip-covers.mjs` из каталога web/.
 *
 * Правила, которые важно не потерять:
 *  - размер ровно 1200×630: это же значение уходит в `og:image`, а в карточках
 *    кадр всё равно режется `object-fit: cover`;
 *  - исходник обязан существовать: отсутствие фото — ошибка, а не тихо
 *    подставленная заглушка (иначе повтор вернётся незаметно);
 *  - иконки берём из PrimeIcons (MIT), цвет — из дизайн-токенов, а не «на глаз»;
 *  - исходники лежат отдельно от готовых обложек: генератор их не перезаписывает.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const photosDir = resolve(webDir, 'public', 'photos');
const srcDir = resolve(photosDir, 'tips-src');
const outDir = resolve(photosDir, 'tips');
const iconsDir = resolve(webDir, 'node_modules', 'primeicons', 'raw-svg');

const W = 1200;
const H = 630;

/**
 * Тонировка по категории. Цвета — из `app/assets/css/tokens.css`
 * (brand / accent / amber / lilac / gold), поэтому обложки не спорят с UI.
 */
const tints = {
  home: '#2a584d',
  kitchen: '#c8893f',
  bathroom: '#9078ba',
  habits: '#d8664e',
  planning: '#c9a227',
  family: '#234b41',
  pets: '#e8806b',
};

/**
 * Манифест обложек: одна запись — одна статья и её собственное фото.
 *
 * `icon` — имя SVG в PrimeIcons, у всех 24 статей иконки разные. Файл исходника
 * выводится из `slug` (`public/photos/tips-src/<slug>.jpg`), поэтому добавить
 * статью — значит положить фото и дописать строку сюда.
 */
const covers = [
  // ── Балкон и окна ────────────────────────────────────────────────────────
  { slug: 'balcony-cleaning', category: 'home', icon: 'sun' },
  { slug: 'windows-without-streaks', category: 'home', icon: 'window-maximize' },

  // ── Ванная и стиральная машина ───────────────────────────────────────────
  { slug: 'bathroom-without-mold', category: 'bathroom', icon: 'shield' },
  { slug: 'washing-machine', category: 'home', icon: 'sync' },

  // ── Питомцы и текстиль ───────────────────────────────────────────────────
  { slug: 'cat-litter-and-hair', category: 'pets', icon: 'star' },
  { slug: 'dog-in-a-flat', category: 'pets', icon: 'heart' },

  // ── Уборка и порядок ─────────────────────────────────────────────────────
  { slug: 'cleaning-with-kids', category: 'family', icon: 'users' },
  { slug: 'dust-and-allergy', category: 'home', icon: 'filter' },
  { slug: 'fifteen-minutes-evening', category: 'habits', icon: 'clock' },
  { slug: 'floors-by-material', category: 'home', icon: 'th-large' },
  { slug: 'hallway-order', category: 'home', icon: 'key' },
  { slug: 'home-workout-10-minutes', category: 'habits', icon: 'bolt' },
  { slug: 'seven-day-spring-clean', category: 'planning', icon: 'calendar' },

  // ── Кухня ────────────────────────────────────────────────────────────────
  { slug: 'fridge-order', category: 'kitchen', icon: 'warehouse' },
  { slug: 'kitchen-30-minutes', category: 'kitchen', icon: 'sparkles' },
  { slug: 'three-boxes-method', category: 'planning', icon: 'box' },

  // ── Привычки ─────────────────────────────────────────────────────────────
  { slug: 'good-habits-for-home-and-self', category: 'habits', icon: 'check-circle' },
  { slug: 'home-office-order', category: 'home', icon: 'desktop' },
  { slug: 'how-not-to-quit-a-habit', category: 'habits', icon: 'replay' },
  { slug: 'language-10-minutes-a-day', category: 'habits', icon: 'language' },
  { slug: 'yard-and-garden-care', category: 'home', icon: 'compass' },

  // ── Детская и бельё ──────────────────────────────────────────────────────
  { slug: 'kids-room-15-minutes', category: 'family', icon: 'gift' },
  { slug: 'laundry-system', category: 'home', icon: 'inbox' },
  { slug: 'mattress-and-bedding', category: 'home', icon: 'moon' },
];

/** Гарантированно уникальный набор: иконка, файл и статья не повторяются. */
const assertUnique = () => {
  for (const key of ['slug', 'icon']) {
    const seen = new Set();
    for (const item of covers) {
      if (seen.has(item[key])) {
        throw new Error(`Повтор в манифесте обложек: ${key} = ${item[key]}`);
      }

      seen.add(item[key]);
    }
  }
};

const svgBuf = (svg) => Buffer.from(svg);

/** Мягкая тонировка по категории: цвет проявляется в углу и растворяется. */
const tintLayer = (color, angle) =>
  svgBuf(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="${angle.x}" y2="${angle.y}">
        <stop offset="0" stop-color="${color}" stop-opacity="0.42"/>
        <stop offset="0.55" stop-color="${color}" stop-opacity="0.14"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#t)"/>
  </svg>`);

/** Тень снизу: под иконкой и на светлых кадрах (белая кухня) нужен контраст. */
const shadeLayer = () =>
  svgBuf(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#0b1310" stop-opacity="0"/>
        <stop offset="1" stop-color="#0b1310" stop-opacity="0.38"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
  </svg>`);

const iconCache = new Map();

/** Внутренности SVG из PrimeIcons: без обёртки и без жёстко заданного цвета. */
const iconInner = async (name) => {
  if (!iconCache.has(name)) {
    const raw = await readFile(resolve(iconsDir, `${name}.svg`), 'utf8');
    const inner = raw
      .replace(/^[\s\S]*?<svg[^>]*>/, '')
      .replace(/<\/svg>[\s\S]*$/, '')
      .replace(/\sfill="(?:black|#000000|currentColor|none)"/g, '');

    if (!inner.trim()) {
      throw new Error(`Пустая иконка PrimeIcons: ${name}.svg`);
    }

    iconCache.set(name, inner);
  }

  return iconCache.get(name);
};

/**
 * Плашка с иконкой: цветной квадрат в левом нижнем углу.
 *
 * Цвет — категория статьи (те же токены, что в интерфейсе), поэтому соседние
 * обложки в сетке различаются ещё до того, как читаешь заголовок: тёплый
 * охра у кухни, лиловый у ванной, коралловый у привычек. Иконка внутри
 * уникальна для статьи — она и есть «лицо» совета.
 */
const chipLayer = async (icon, color) => {
  const side = 120;
  const padX = 36;
  // Отступ снизу — не «на глаз»: карточка совета режет обложку по высоте
  // (168 px при ширине около 400 px), и плашка, прижатая к самому низу,
  // лишалась нижней кромки. 84 px держат её внутри самой узкой рамки.
  const padBottom = 84;
  const iconSize = 64;
  const x = padX;
  const y = H - side - padBottom;
  const scale = iconSize / 24;

  return svgBuf(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="${x + 3}" y="${y + 5}" width="${side}" height="${side}" rx="32" fill="#0b1310" fill-opacity="0.22"/>
    <rect x="${x}" y="${y}" width="${side}" height="${side}" rx="32" fill="${color}"/>
    <g transform="translate(${x + (side - iconSize) / 2}, ${y + (side - iconSize) / 2}) scale(${scale})" fill="#ffffff" fill-opacity="0.96">
      ${await iconInner(icon)}
    </g>
  </svg>`);
};

const angleFor = (index) => {
  const angles = [
    { x: '0', y: '0' },
    { x: '1', y: '0' },
    { x: '1', y: '1' },
    { x: '0', y: '1' },
    { x: '0.5', y: '0' },
    { x: '0', y: '0.5' },
  ];

  return angles[index % angles.length];
};

/** Небольшая разбежка яркости и насыщенности: разные фото сближаются по настроению. */
const grade = (index) => ({
  saturation: 0.94 + ((index * 7) % 9) * 0.015,
  brightness: 0.97 + ((index * 5) % 7) * 0.01,
});

assertUnique();
await mkdir(outDir, { recursive: true });

const rows = [];

for (const [index, item] of covers.entries()) {
  const source = resolve(srcDir, `${item.slug}.jpg`);

  let frame;

  try {
    frame = sharp(source).rotate();
  } catch {
    throw new Error(`Нет исходника для «${item.slug}»: положите ${source}`);
  }

  const { saturation, brightness } = grade(index);

  const buffer = await frame
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .modulate({ saturation, brightness })
    .composite([
      { input: tintLayer(tints[item.category], angleFor(index)), blend: 'soft-light' },
      { input: shadeLayer(), blend: 'over' },
      { input: await chipLayer(item.icon, tints[item.category]), blend: 'over' },
    ])
    .jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  await sharp(buffer).toFile(resolve(outDir, `${item.slug}.jpg`));

  const kb = Math.round(buffer.length / 1024);
  rows.push({ slug: item.slug, category: item.category, icon: item.icon, kb });
}

// Сверяем с содержимым коллекций: у каждой статьи (RU и EN) должна быть обложка.
const tipsRu = (await readdir(resolve(webDir, 'content', 'tips'))).filter((f) => f.endsWith('.md'));
const tipsEn = (await readdir(resolve(webDir, 'content', 'en', 'tips'))).filter((f) => f.endsWith('.md'));
const made = new Set(rows.map((r) => r.slug));
const missing = [...tipsRu, ...tipsEn]
  .map((f) => f.replace(/\.md$/, ''))
  .filter((slug) => !made.has(slug));

for (const row of rows) {
  console.log(`  ${row.slug.padEnd(30)} ${row.category.padEnd(9)} ${row.icon.padEnd(16)} ${row.kb} KB`);
}

if (missing.length) {
  console.warn(`\nВнимание: нет обложки для статей: ${missing.join(', ')}`);
}

console.log(`\nГотово: ${rows.length} обложек в public/photos/tips/ (${W}×${H}).`);
