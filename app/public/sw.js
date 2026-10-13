// Label Drop service worker: works offline, but never holds back an update.
//  - Pages: network first (latest version when online), cached copy when offline.
//  - Hashed build files (assets/*): cache first — their names change with every build.
//  - Character models (characters/*.glb): cached the first time they are shown.
//  - Google Fonts: stale-while-revalidate, so block labels render offline too.
// Only caches named "label-drop-*" are ever touched; other apps on this origin keep theirs.
// The list of files to keep is generated at build time (precache.json, see vite.config.ts).
const CACHE = 'label-drop-v3';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SCOPE = new URL('./', self.location.href).href;

async function precache(force) {
  const res = await fetch(new URL('precache.json', SCOPE), { cache: 'no-store' });
  if (!res.ok) return;
  const { files } = await res.json();
  const cache = await caches.open(CACHE);
  const wanted = new Set(files.map((f) => new URL(f, SCOPE).href));
  // Add what's missing (shell files are refreshed when forced: they keep the same names).
  await Promise.all(
    [...wanted].map(async (url) => {
      const hashed = url.includes('/assets/');
      if (!force || hashed) {
        if (await cache.match(url)) return;
      }
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) await cache.put(url, r);
      } catch {
        /* offline: try again next time */
      }
    }),
  );
  // Drop build files from older versions.
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !wanted.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache(true).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('label-drop-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

let lastRefresh = 0;

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok) {
      await cache.put(request, res.clone());
      // A fresh page may reference a new build: top up the offline copy in the background.
      if (request.mode === 'navigate' && Date.now() - lastRefresh > 60_000) {
        lastRefresh = Date.now();
        precache(true).catch(() => undefined);
      }
    }
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' && (await cache.match(SCOPE)));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await update) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (!request.url.startsWith(SCOPE)) return;
  if (url.pathname.includes('/assets/') || url.pathname.includes('/characters/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
