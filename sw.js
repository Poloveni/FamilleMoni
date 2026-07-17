/* Service Worker — Famille Moni (PWA) */
const CACHE = 'moni-v4';
const CORE = [
  './', './index.html', './os.html', './espace-membre.html',
  './logo.jpg', './hero-bg.webp', './icon-192.png', './icon-512.png',
  './supabase-config.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // On ne touche pas aux appels externes (Discord, Supabase, FiveM…)
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('.html');
  if (isHTML) {
    // HTML : réseau d'abord (toujours à jour), cache en secours (hors ligne)
    e.respondWith(
      fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })
        .catch(() => caches.match(req))
    );
  } else {
    // Assets : cache d'abord (rapide), sinon réseau
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
        return res;
      }).catch(() => cached))
    );
  }
});
