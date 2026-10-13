import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = Number(process.env.PORT) || 5173;

/** LAN URLs of this machine (IPv4, non-internal), so phones on the same network can open the dev server. */
function lanUrls(): string[] {
  const urls: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${PORT}/`);
    }
  }
  // Private home/office ranges first (192.168.x.x, 10.x, 172.16–31.x); virtual adapters tend to sort last.
  const rank = (url: string) => (url.includes('//192.168.') ? 0 : url.includes('//10.') ? 1 : url.match(/\/\/172\.(1[6-9]|2\d|3[01])\./) ? 2 : 3);
  return urls.sort((a, b) => rank(a) - rank(b));
}

/** Files under public/ (relative, forward slashes). */
function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? publicFiles(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

/**
 * precache.json: what the service worker keeps for offline play — every build file plus the
 * public shell (manifest, icons). Character models are left out (≈0.9 MB each); the service
 * worker caches each one the first time it is shown.
 */
function precacheManifest(mode: string): Plugin {
  return {
    name: 'matomate-precache',
    apply: 'build',
    generateBundle(_, bundle) {
      // Models are cached when first shown; the pin edition has no character pictures either (scripts/prune-dist.mjs).
      const shell = publicFiles('public').filter((f) => f !== 'sw.js' && !f.startsWith('characters/') && !/^avatars\/[^/]+\.glb$/.test(f) && (mode === 'dx' || !f.startsWith('avatars/')));
      const files = ['./', ...Object.keys(bundle), ...shell];
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ files }, null, 1) });
    },
  };
}

/** Dev only: saves the avatar pictures made by src/room/thumbs.ts (open the dev server with ?make-thumbs). */
function avatarThumbs(): Plugin {
  return {
    name: 'matomate-avatar-thumbs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__thumbs', (req, res) => {
        const name = (req.url ?? '').slice(1);
        if (req.method !== 'POST' || !/^(icon-)?avatar\d{1,2}\.webp$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          // Icon art is a source for scripts/make-icons.mjs, not something the app serves.
          const dir = name.startsWith('icon-') ? 'icons/dx' : 'public/avatars/thumbs';
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), precacheManifest(mode), avatarThumbs()],
  // Relative asset paths so the build works under any sub-path (GitHub Pages serves it at /label-drop/app/).
  base: './',
  // host: true listens on all interfaces (0.0.0.0), not just localhost, for same-LAN device testing.
  server: { host: true, port: PORT, strictPort: true },
  preview: { host: true, port: 4173 },
  // LAN URLs only for the dev server: a production build must not embed this machine's local IPs.
  define: { __LAN_URLS__: JSON.stringify(command === 'serve' ? lanUrls() : []) },
}));
