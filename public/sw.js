// Zorgt dat de app ook zonder internet opent. Verhoog VERSION bij elke wijziging aan de app.
const VERSION = 'v1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// Eerst het net (zodat je altijd de nieuwste versie krijgt), anders de bewaarde kopie.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
