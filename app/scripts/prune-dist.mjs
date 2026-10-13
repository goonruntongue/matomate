// After a build: make dist-<edition> that edition's own site. public/ is shared and Vite copies all
// of it, so this removes the other edition's avatar files and, for DX, puts its own app icon, name
// and title in place (the home-screen app must be told apart from the pin edition's).
// Usage: node scripts/prune-dist.mjs pin|dx
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const edition = process.argv[2];
if (edition !== 'pin' && edition !== 'dx') throw new Error('usage: prune-dist.mjs pin|dx');
const dist = `dist-${edition}`;

const avatars = join(dist, 'avatars');
if (existsSync(avatars)) {
  for (const name of readdirSync(avatars)) {
    const isPin = name.startsWith('avatar-pin');
    if (edition === 'pin' ? !isPin : isPin) rmSync(join(avatars, name), { recursive: true });
  }
}
// The single-play characters (Label Drop's levels) are not part of the team game.
rmSync(join(dist, 'characters'), { recursive: true, force: true });

// App icon, name and title. Both editions keep the same file names (icons/…, manifest.webmanifest).
if (edition === 'dx') {
  cpSync(join(dist, 'icons-dx'), join(dist, 'icons'), { recursive: true });
  const edit = (file, change) => writeFileSync(join(dist, file), change(readFileSync(join(dist, file), 'utf8')));
  edit('manifest.webmanifest', (text) => {
    const manifest = JSON.parse(text);
    manifest.name = 'Mato mate DX';
    manifest.short_name = 'Mato mate DX';
    return JSON.stringify(manifest, null, 2) + '\n';
  });
  edit('index.html', (html) => {
    const out = html
      .replace('<title>Mato mate（マトメイト）</title>', '<title>Mato mate DX（マトメイト DX）</title>')
      .replace('name="apple-mobile-web-app-title" content="Mato mate"', 'name="apple-mobile-web-app-title" content="Mato mate DX"')
      .replace('<b>Mato <span>mate</span></b>', '<b>Mato <span>mate</span> DX</b>');
    if (out === html) throw new Error('index.html: nothing to rename (did the markup change?)');
    return out;
  });
}
rmSync(join(dist, 'icons-dx'), { recursive: true, force: true });

// Phones remember an app icon by its address (iOS keeps it even after the site's cache is cleared), so
// the icon addresses carry a stamp of the artwork: a new icon is a new address, and is fetched again.
const stamp = createHash('md5').update(readFileSync(join(dist, 'icons', 'icon-512.png'))).digest('hex').slice(0, 8);
for (const file of ['index.html', 'manifest.webmanifest']) {
  const text = readFileSync(join(dist, file), 'utf8');
  const out = text.replace(/(icons\/[a-z0-9-]+\.png|manifest\.webmanifest)(\?v=[0-9a-f]+)?(?=")/g, `$1?v=${stamp}`);
  if (out === text) throw new Error(`${file}: no icon address to stamp`);
  writeFileSync(join(dist, file), out);
}
// The offline list must not name files that are not on this site.
const precache = join(dist, 'precache.json');
if (existsSync(precache)) {
  const list = JSON.parse(readFileSync(precache, 'utf8'));
  list.files = list.files.filter((f) => !f.startsWith('icons-dx/') && (f === './' || existsSync(join(dist, f))));
  writeFileSync(precache, JSON.stringify(list, null, 1));
}
console.log(`${dist}: pruned`);
