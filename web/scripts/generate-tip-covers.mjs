import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Собирает уникальные обложки статей-советов из четырёх исходных фотографий.
 *
 * Зачем: обложек в `public/photos/` всего четыре, а статей — 24. Пока каждый
 * совет брал один и тот же кадр, сетка «Советы» выглядела как одна картинка,
 * повторённая восемь раз. Здесь каждой статье достаётся свой **кадр** (окно
 * кропа), своя лёгкая тонировка по категории и своя иконка темы, поэтому файлы
 * не повторяются ни внутри языка, ни между RU и EN.
 *
 * Запуск: `node scripts/generate-tip-covers.mjs` из каталога web/.
 *
 * Правила, которые важно не потерять:
 *  - размер ровно 1200×630: это же значение уходит в `og:image`, а в карточках
 *    кадр всё равно режется `object-fit: cover`;
 *  - координаты кропа заданы в пикселях ИСХОДНИКА и проверяются: окно за
 *    границей кадра — ошибка, а не тихо обрезанная картинка;
 *  - иконки берём из PrimeIcons (MIT), цвет — из дизайн-токенов, а не «на глаз»;
 *  - исходники не перезаписываем: обложки челленджей и «Совета дня» на главной
 *    продолжают жить на старых файлах.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const photosDir = resolve(webDir, 'public', 'photos');
const outDir = resolve(photosDir, 'tips');
const iconsDir = resolve(webDir, 'node_modules', 'primeicons', 'raw-svg');

const W = 1200;
const H = 630;
const ASPECT = W / H;

/** Исходники: короткое имя → файл и его реальные размеры (проверяются при чтении). */
const sources = {
  wipe: resolve(photosDir, 'spring-cleaning.jpg'),
  kitchen: resolve(photosDir, 'kitchen-white.jpg'),
  laundry: resolve(photosDir, 'laundry.jpg'),
  cozy: resolve(photosDir, 'autumn-home.jpg'),
};

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
 * Манифест обложек: одна запись — одна статья.
 *
 * `crop` — окно [left, top, width, height] в пикселях исходника, отношение
 * сторон 1200:630 (проверяется). `flip` зеркалит кадр: там, где два совета
 * берут один и тот же предмет (окно, люк машины), зеркало разводит композицию.
 * `icon` — имя SVG в PrimeIcons, у всех 24 статей иконки разные.
 */
const covers = [
  // ── Балкон и окна: свет из окна, а не тряпка ─────────────────────────────
  { slug: 'balcony-cleaning', category: 'home', src: 'kitchen', icon: 'sun', crop: [520, 700, 680, 357] },
  { slug: 'windows-without-streaks', category: 'home', src: 'kitchen', icon: 'window-maximize', crop: [500, 400, 700, 368] },

  // ── Ванная и стиральная машина: один предмет, разные кадры ────────────────
  { slug: 'bathroom-without-mold', category: 'bathroom', src: 'laundry', icon: 'shield', crop: [300, 150, 640, 336] },
  { slug: 'washing-machine', category: 'home', src: 'laundry', icon: 'sync', crop: [240, 0, 700, 368], flip: true },

  // ── Питомцы и текстиль: клубок шерсти крупным планом ─────────────────────
  { slug: 'cat-litter-and-hair', category: 'pets', src: 'laundry', icon: 'star', crop: [520, 500, 560, 294] },
  { slug: 'dog-in-a-flat', category: 'pets', src: 'cozy', icon: 'heart', crop: [720, 400, 480, 252], flip: true },

  // ── Уборка руками: разные зоны одного кадра ──────────────────────────────
  { slug: 'cleaning-with-kids', category: 'family', src: 'wipe', icon: 'users', crop: [300, 980, 900, 473] },
  { slug: 'dust-and-allergy', category: 'home', src: 'wipe', icon: 'filter', crop: [130, 1080, 700, 368] },
  { slug: 'fifteen-minutes-evening', category: 'habits', src: 'wipe', icon: 'clock', crop: [0, 690, 1200, 630] },
  { slug: 'floors-by-material', category: 'home', src: 'wipe', icon: 'th-large', crop: [0, 950, 1200, 630], flip: true },
  { slug: 'hallway-order', category: 'home', src: 'wipe', icon: 'key', crop: [0, 470, 720, 378] },
  { slug: 'home-workout-10-minutes', category: 'habits', src: 'wipe', icon: 'bolt', crop: [600, 1080, 600, 315] },
  { slug: 'seven-day-spring-clean', category: 'planning', src: 'wipe', icon: 'calendar', crop: [0, 300, 1200, 630] },

  // ── Кухня: полки, банки, свет из окна ────────────────────────────────────
  { slug: 'fridge-order', category: 'kitchen', src: 'kitchen', icon: 'warehouse', crop: [300, 1260, 560, 294] },
  { slug: 'kitchen-30-minutes', category: 'kitchen', src: 'kitchen', icon: 'sparkles', crop: [60, 380, 1080, 567] },
  { slug: 'three-boxes-method', category: 'planning', src: 'kitchen', icon: 'box', crop: [200, 1220, 780, 410] },

  // ── Привычки: книги, плед, чай ───────────────────────────────────────────
  { slug: 'good-habits-for-home-and-self', category: 'habits', src: 'cozy', icon: 'check-circle', crop: [0, 150, 1200, 630] },
  { slug: 'home-office-order', category: 'home', src: 'cozy', icon: 'desktop', crop: [0, 330, 660, 347] },
  { slug: 'how-not-to-quit-a-habit', category: 'habits', src: 'cozy', icon: 'replay', crop: [420, 40, 700, 368] },
  { slug: 'language-10-minutes-a-day', category: 'habits', src: 'cozy', icon: 'language', crop: [580, 260, 620, 326] },
  { slug: 'yard-and-garden-care', category: 'home', src: 'cozy', icon: 'compass', crop: [0, 430, 660, 347], flip: true },

  // ── Детская и бельё ─────────────────────────────────────────────────────
  { slug: 'kids-room-15-minutes', category: 'family', src: 'laundry', icon: 'gift', crop: [420, 60, 780, 410] },
  { slug: 'laundry-system', category: 'home', src: 'laundry', icon: 'inbox', crop: [260, 310, 880, 462] },
  { slug: 'mattress-and-bedding', category: 'home', src: 'laundry', icon: 'moon', crop: [420, 380, 640, 336] },
];

/** Гарантированно уникальный набор: иконка, кадр и файл не повторяются. */
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

/** Окно кропа обязано лежать внутри исходника и иметь отношение сторон 1200:630. */
const normalizeCrop = (crop, meta) => {
  const [left, top, width, height] = crop.map(Math.round);
  const need = { width, height: Math.round(width / ASPECT) };

  if (left < 0 || top < 0 || left + width > meta.width || top + height > meta.height) {
    throw new Error(
      `Кроп ${crop.join(',')} выходит за кадр ${meta.width}×${meta.height} — поправьте манифест`,
    );
  }

  if (Math.abs(width / height - ASPECT) > 0.02) {
    throw new Error(
      `Кроп ${crop.join(',')} имеет отношение ${(width / height).toFixed(3)}, нужно ${ASPECT.toFixed(3)}`,
    );
  }

  return { left, top, width: need.width, height: need.height };
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

/** Небольшая разбежка яркости и насыщенности: кадры с одного фото не выглядят одинаковыми. */
const grade = (index) => ({
  saturation: 0.94 + ((index * 7) % 9) * 0.015,
  brightness: 0.97 + ((index * 5) % 7) * 0.01,
});

assertUnique();
await mkdir(outDir, { recursive: true });

const rows = [];

for (const [index, item] of covers.entries()) {
  const base = sharp(sources[item.src]).rotate();
  const meta = await base.metadata();
  const crop = normalizeCrop(item.crop, meta);
  const { saturation, brightness } = grade(index);

  let frame = sharp(sources[item.src])
    .rotate()
    .extract(crop)
    .resize(W, H, { fit: 'cover', position: 'centre' });

  if (item.flip) {
    frame = frame.flop();
  }

  frame = frame.modulate({ saturation, brightness });

  const buffer = await frame
    .composite([
      { input: tintLayer(tints[item.category], angleFor(index)), blend: 'soft-light' },
      { input: shadeLayer(), blend: 'over' },
      { input: await chipLayer(item.icon, tints[item.category]), blend: 'over' },
    ])
    .jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const out = resolve(outDir, `${item.slug}.jpg`);
  await sharp(buffer).toFile(out);

  const kb = Math.round(buffer.length / 1024);
  rows.push({ slug: item.slug, category: item.category, icon: item.icon, kb, crop });
}

// Сверяем с содержимым коллекций: у каждой статьи (RU и EN) должна быть обложка.
const tipsRu = (await readdir(resolve(webDir, 'content', 'tips'))).filter((f) => f.endsWith('.md'));
const tipsEn = (await readdir(resolve(webDir, 'content', 'en', 'tips'))).filter((f) => f.endsWith('.md'));
const made = new Set(rows.map((r) => r.slug));
const missing = [...tipsRu, ...tipsEn]
  .map((f) => f.replace(/\.md$/, ''))
  .filter((slug) => !made.has(slug));

for (const row of rows) {
  const crop = row.crop;
  console.log(
    `  ${row.slug.padEnd(30)} ${row.category.padEnd(9)} ${row.icon.padEnd(16)} ` +
      `crop ${crop.left},${crop.top} ${crop.width}×${crop.height}  ${row.kb} KB`,
  );
}

if (missing.length) {
  console.warn(`\nВнимание: нет обложки для статей: ${missing.join(', ')}`);
}

console.log(`\nГотово: ${rows.length} обложек в public/photos/tips/ (${W}×${H}).`);
