// Service worker for the S-3 SRR page (generated into dist/sw.js by scripts/sw-plugin.mjs; edit this template).
// Install caches the core page so a second visit works offline; the globe files are cached once the globe
// has loaded, or when the page asks ("Preload for offline"). Same-origin files are served cache-first;
// the page itself is served from cache and refreshed in the background. Other origins pass straight through.
const VERSION = '__VERSION__';
const CORE = __CORE__;
const GLOBE = __GLOBE__;
const CACHE = `srr-${VERSION}`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('srr-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(page(req, e)); return; }
  if (!req.url.startsWith(self.registration.scope)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});

// Same origin but another site (e.g. the requirements data): fresh when online, last copy when offline.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

// Stale-while-revalidate for the page: instant from cache, updated for next time when online.
async function page(req, e) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match('./');
  const update = fetch(req).then(res => { if (res.ok) cache.put('./', res.clone()); return res; });
  if (hit) { e.waitUntil(update.catch(() => {})); return hit; }
  return update;
}

// Messages from the page: { type: 'status' } and { type: 'preload' } (caches the globe, reporting progress).
self.addEventListener('message', e => {
  const port = e.ports[0];
  if (!port) return;
  const send = msg => port.postMessage(msg);
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const missing = async list => (await Promise.all(list.map(async f => ((await cache.match(f)) ? null : f)))).filter(Boolean);
    if (e.data?.type === 'preload') {
      await cache.addAll(await missing(CORE));
      const todo = await missing(GLOBE);
      let done = GLOBE.length - todo.length, failed = 0;
      send({ type: 'progress', done, total: GLOBE.length });
      // A few at a time, so progress is visible and a bad connection doesn't fail the whole batch.
      for (let i = 0; i < todo.length; i += 6) {
        await Promise.all(todo.slice(i, i + 6).map(f => cache.add(f).then(() => done++, () => failed++)));
        send({ type: 'progress', done, total: GLOBE.length });
      }
      send({ type: 'status', core: (await missing(CORE)).length === 0, globe: failed === 0 && (await missing(GLOBE)).length === 0 });
    } else {
      send({ type: 'status', core: (await missing(CORE)).length === 0, globe: (await missing(GLOBE)).length === 0 });
    }
  })());
});
