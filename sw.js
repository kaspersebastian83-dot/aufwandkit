/* BelegKit – Service Worker
   Makes the online version usable offline and installable.
   Strategy "network first": when online, always the newest version from GitHub Pages is loaded (so updates arrive
   immediately); when offline or the network is slow (> 4 s), the last cached version is used.
   Only the app's own files are handled here – project folders and files never pass through this file.

   Other apps live under the same address (Projektzentrale, FotoKit, PlanKit, LabelKit) and share the browser's cache storage.
   This worker therefore only ever touches caches with its own prefix and only answers requests inside its own scope. */
const SCOPE = self.registration.scope;
const PREFIX = 'aufwandkit:' + SCOPE + ':';
const CACHE = PREFIX + 'v3';
const LEGACY = [];
const ASSETS = ['./', './index.html', './time-store.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']
  .map(f => new URL(f, SCOPE).href);
const INDEX = new URL('index.html', SCOPE).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => (k.startsWith(PREFIX) && k !== CACHE) || LEGACY.includes(k))   // never other apps' caches
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromNet = fetch(req, { cache: 'no-store' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? INDEX : req, res.clone());
      return res;
    });
    const timeout = new Promise(res => setTimeout(() => res(null), 4000));
    try{
      const res = await Promise.race([fromNet, timeout]);
      if (res) return res;
    }catch(err){ /* offline – fall through to cache */ }
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match(INDEX));
    return cached || fromNet;   // nothing cached yet: keep waiting for the network
  })());
});
