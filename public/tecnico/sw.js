// ILUMINA CORURIPE TÉCNICO — Service Worker
const CACHE_NAME = 'ilumina-tec-v19-modal-2026-11-05';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  '../shared/config.js',
  '../shared/design-tokens.css',
  '../tecnico.css',
  '../shared/infrastructure/config.js',
  '../shared/infrastructure/idb.js',
  '../shared/infrastructure/ApiClient.js',
  './js/main.js',
  './js/domain/Ticket.js',
  './js/domain/Close.js',
  './js/domain/Attempt.js',
  './js/domain/StockItem.js',
  './js/infrastructure/TicketCache.js',
  './js/infrastructure/CloseQueue.js',
  './js/infrastructure/PhotoCache.js',
  './js/application/FecharChamado.js',
  './js/application/SincronizarBaixas.js',
  './js/application/CarregarRota.js',
  './js/presentation/ListView.js',
  './js/presentation/MapView.js',
  './js/presentation/CloseFormView.js',
  './js/presentation/StockView.js',
  './js/presentation/Controllers.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './leaflet.css',
  './leaflet.js',
  './jsQR.js'
];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'script.google.com') return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
