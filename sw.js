/* Service worker: rende l'app utilizzabile anche senza connessione.
   Nessun dato dell'utente passa da qui: si occupa solo dei file del programma. */

const CACHE = 'interviste-v1';
const FILE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Risposta immediata dalla cache, aggiornamento in background. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(inCache => {
      const dallaRete = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      }).catch(() => inCache);
      return inCache || dallaRete;
    })
  );
});
