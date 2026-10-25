const VERSION = 'd05cef7a';
const CACHE = 'ythunter-' + VERSION;
const FILES = ["./","index.html","app.css?v=d05cef7a","app.js?v=d05cef7a","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","icons/favicon-32.png"];

self.addEventListener('install', (e) => {
  // Tidak skipWaiting otomatis: user yang menekan "Perbarui" supaya tidak ada reload mendadak.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ythunter-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: false }).then((r) => r || fetch(req).then((res) => {
    if (res.ok && !new URL(req.url).pathname.endsWith('/sw.js')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
