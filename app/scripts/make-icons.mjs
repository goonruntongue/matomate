// Rasterize icons/icon.svg into the PNGs the PWA manifest and iOS need (run: npm run icons).
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SRC = fileURLToPath(new URL('../icons/icon.svg', import.meta.url));
const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
await mkdir(OUT, { recursive: true });

const targets = [
  { file: 'apple-touch-icon.png', size: 180 }, // iOS home screen
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable: artwork kept inside the central safe zone (Android crops to circles/squircles).
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'favicon-32.png', size: 32 },
];

for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * (t.pad ?? 0)));
  const art = await sharp(SRC, { density: 384 }).resize(inner, inner).png().toBuffer();
  const img = t.pad
    ? sharp({ create: { width: t.size, height: t.size, channels: 4, background: '#050C1C' } }).composite([
        { input: art, gravity: 'center' },
      ])
    : sharp(art);
  await img.png().toFile(OUT + t.file);
  console.log('wrote', t.file);
}
