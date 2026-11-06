// ILUMINA CORURIPE — CIDADÃO — Service Worker
// Escopo: "/" — mas NUNCA intercepta "/tecnico/" nem "/api/", que são rotas dinâmicas/separadas.
const CACHE_NAME = 'ilumina-cidadao-v7-sem-qr-2026-11-05';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './shared/config.js',
  './shared/infrastructure/config.js',
  './shared/infrastructure/idb.js',
  './shared/infrastructure/ApiClient.js',
  './js/cidadao/main.js',
  './js/cidadao/domain/Report.js',
  './js/cidadao/infrastructure/IndexedDbReportRepository.js',
  './js/cidadao/infrastructure/GeolocationService.js',
  './js/cidadao/application/EnviarReporte.js',
  './js/cidadao/application/SincronizarFila.js',
  './js/cidadao/presentation/FormView.js',
  './js/cidadao/presentation/GpsView.js',
  './js/cidadao/presentation/ReportController.js',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

// addAll é atômico: um 404 derruba o cache inteiro.
// Cacheia item a item para que um arquivo faltando não quebre o offline.
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
  // Nunca cacheia chamadas à API REST Node.js ou ao Apps Script
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') return;
  // App do técnico tem service worker próprio — deixa passar direto
  if (url.origin === self.location.origin && url.pathname.startsWith('/tecnico/')) return;
  // Links antigos (ex.: /?poste=P-0001 de plaquetas ja instaladas) abrem o app tambem sem sinal.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
