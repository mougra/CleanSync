import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Пересобирает иконки из SVG-логотипа.
 *
 * Запуск: `node scripts/generate-icons.mjs` из каталога web/.
 * Правки в логотипе делаются в public/logo*.svg, а PNG генерируются здесь —
 * руками ничего не рисуем, чтобы размеры не расходились.
 */
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');
const iconsDir = resolve(publicDir, 'icons');

const sources = {
  icon: resolve(publicDir, 'logo-icon.svg'),
  maskable: resolve(publicDir, 'logo-maskable.svg'),
};

/** Что и из чего собираем: имя файла, исходник и сторона квадрата. */
const targets = [
  { file: 'favicon-32.png', from: 'icon', size: 32 },
  { file: 'icon-192.png', from: 'icon', size: 192 },
  { file: 'icon-512.png', from: 'icon', size: 512 },
  { file: 'apple-touch-icon.png', from: 'icon', size: 180 },
  { file: 'maskable-512.png', from: 'maskable', size: 512 },
];

const svgCache = new Map();

const loadSvg = async (path) => {
  if (!svgCache.has(path)) {
    svgCache.set(path, await readFile(path));
  }

  return svgCache.get(path);
};

for (const target of targets) {
  const svg = await loadSvg(sources[target.from]);
  const output = resolve(iconsDir, target.file);

  await sharp(svg, { density: 384 })
    .resize(target.size, target.size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(output);

  console.log(`  ${target.file} ← ${target.from}.svg (${target.size}×${target.size})`);
}

// Картинка для соцсетей: логотип на светлом фоне, ровно 1200×630 (стандарт og:image).
const lockup = await sharp(await loadSvg(resolve(publicDir, 'logo-lockup.svg')), { density: 384 })
  .resize({ width: 760 })
  // Локап прозрачный: сначала заливаем фон, иначе прозрачность останется дырой.
  .flatten({ background: '#FEF9F6' })
  .png()
  .toBuffer();

const lockupMeta = await sharp(lockup).metadata();
const padX = Math.round((1200 - (lockupMeta.width ?? 0)) / 2);
const padY = Math.round((630 - (lockupMeta.height ?? 0)) / 2);

await sharp(lockup)
  .extend({
    top: padY,
    bottom: 630 - (lockupMeta.height ?? 0) - padY,
    left: padX,
    right: 1200 - (lockupMeta.width ?? 0) - padX,
    background: '#FEF9F6',
  })
  .png({ compressionLevel: 9 })
  .toFile(resolve(publicDir, 'og-image.png'));

console.log('  og-image.png ← logo-lockup.svg (1200×630)');
