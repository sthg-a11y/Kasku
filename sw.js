/* Kasku - service worker: aplikasi tetap bisa dibuka cepat/offline.
   Data keuangan TIDAK di-cache di sini (hanya file aplikasi). */
const VER = 'kasku-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // File aplikasi sendiri: tampilkan cache dulu, perbarui di belakang layar
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const salinan = res.clone();
              caches.open(VER).then((c) => c.put(req, salinan));
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Library grafik dari CDN: cache-first
  if (url.host === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const salinan = res.clone();
            caches.open(VER).then((c) => c.put(req, salinan));
          }
          return res;
        });
      })
    );
  }
  // Selain itu (Apps Script, font): biarkan langsung ke jaringan
});
