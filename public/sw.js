// ILUMINA CORURIPE — CIDADÃO — Service Worker
// Escopo: "/" — mas NUNCA intercepta "/tecnico/", que tem SW próprio.
const CACHE_NAME = 'ilumina-cidadao-v5-monorepo-2026-09-17';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './shared/config.js',
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
  // Nunca cacheia chamadas ao Apps Script (precisam ser fresh)
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') return;
  // App do técnico tem service worker próprio — deixa passar direto
  if (url.origin === self.location.origin && url.pathname.startsWith('/tecnico/')) return;
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
