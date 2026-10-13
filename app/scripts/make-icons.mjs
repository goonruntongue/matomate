// Makes the PNGs the PWA manifests and iOS need (run: npm run icons).
//  - Pin edition (public/icons/): icons/icon.svg.
//  - DX edition (public/icons-dx/): icons/icon-dx.svg, three of the characters standing in the tray
//    (icons/dx/*.webp, drawn by the dev tool: open the dev server with ?make-thumbs=icon), and the DX badge.
// scripts/prune-dist.mjs puts the right set in each build.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));

const targets = [
  { file: 'apple-touch-icon.png', size: 180 }, // iOS home screen
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // Maskable: artwork kept inside the central safe zone (Android crops to circles/squircles).
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1 },
  { file: 'favicon-32.png', size: 32 },
];

const svg = (path, size) => sharp(at(path), { density: 384 }).resize(size, size).png().toBuffer();

/** Square artwork of an edition at `size` pixels. */
async function art(edition, size) {
  if (edition === 'pin') return svg('../icons/icon.svg', size);
  // Positions are fractions of the icon: [file, width, left, top]. Back row first.
  const cast = [
    ['../icons/dx/icon-avatar2.webp', 0.4, 0.05, 0.36],
    ['../icons/dx/icon-avatar7.webp', 0.4, 0.55, 0.36],
    ['../icons/dx/icon-avatar12.webp', 0.56, 0.22, 0.2],
  ];
  const layers = [];
  for (const [file, width, left, top] of cast) {
    const px = Math.round(size * width);
    layers.push({ input: await sharp(at(file)).resize(px, px).png().toBuffer(), left: Math.round(size * left), top: Math.round(size * top) });
  }
  layers.push({ input: await svg('../icons/icon-dx-badge.svg', size), left: 0, top: 0 });
  return sharp(await svg('../icons/icon-dx.svg', size)).composite(layers).png().toBuffer();
}

for (const [edition, dir] of [
  ['pin', '../public/icons/'],
  ['dx', '../public/icons-dx/'],
]) {
  await mkdir(at(dir), { recursive: true });
  for (const t of targets) {
    const inner = Math.round(t.size * (1 - 2 * (t.pad ?? 0)));
    // Drawn large, then reduced: small sizes come out cleaner than compositing at 32 px.
    const picture = await sharp(await art(edition, 1024)).resize(inner, inner).png().toBuffer();
    const img = t.pad
      ? sharp({ create: { width: t.size, height: t.size, channels: 4, background: '#050C1C' } }).composite([{ input: picture, gravity: 'center' }])
      : sharp(picture);
    await img.png().toFile(at(dir) + t.file);
    console.log('wrote', edition, t.file);
  }
}
