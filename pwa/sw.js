// Apex Grand Prix offline worker.
// The game page is checked against the server on every launch (a cheap "not modified" reply when nothing
// changed), so published updates arrive on their own; the cached copy is used when offline or on a slow link.
const BUILD = '__BUILD__';
const PAGE = 'apex-page', LIBS = 'apex-libs-v1';
const CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== PAGE && k !== LIBS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'build') e.source && e.source.postMessage({ build: BUILD }); });

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // the game itself: network first (revalidated), cache fallback
  if (req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')))) {
    e.respondWith((async () => {
      const cache = await caches.open(PAGE);
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-cache' }), 6000);
        if (res.ok) cache.put('./', res.clone());
        return res;
      } catch (err) {
        return (await cache.match('./')) || (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }
  // three.js and fonts are versioned: cache first
  if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.open(LIBS).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })));
    return;
  }
  // everything else on this site (icons, manifest)
  if (url.origin === location.origin) e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
