/* Service Worker — Famille Moni (PWA) */
const CACHE = 'moni-v6';
const CORE = [
  './', './index.html', './os.html', './espace-membre.html',
  './logo.jpg', './hero-bg.webp', './icon-192.png', './icon-512.png',
  './manifest.json', './404.html', './dashboard.css', './animations.css'
];

self.addEventListener('install', e => {
  // allSettled : si un seul fichier manque, on met quand même les autres en cache.
  // Avec addAll (tout ou rien), un 404 vidait silencieusement tout le cache.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // On ne touche pas aux appels externes (Discord, Supabase, FiveM…)
  if (url.origin !== location.origin) return;
  // Les médias envoient des requêtes partielles (Range) : les mettre en cache
  // casse la lecture et le déplacement dans la piste sur Safari.
  if (/\.(m4a|mp3|mp4|webm|ogg|wav)$/i.test(url.pathname)) return;

  // supabase-config.js contient la liste des membres : il doit TOUJOURS être frais,
  // sinon les visiteurs habituels gardent l'ancienne liste après une mise à jour.
  // Les fichiers de code (pages, styles, scripts) doivent TOUJOURS être
  // frais : sinon, après une mise à jour du site, les visiteurs habituels
  // gardent un ancien CSS avec un nouveau HTML — et la page s'affiche
  // cassée. Le cache reste utilisé en secours quand il n'y a pas de réseau.
  const toujoursFrais = req.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.js');

  if (toujoursFrais) {
    // Réseau d'abord (toujours à jour), cache en secours (hors ligne).
    e.respondWith(
      fetch(req)
        .then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Assets : cache d'abord (rapide), sinon réseau.
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
        return res;
      }).catch(() => new Response('', { status: 504, statusText: 'Hors ligne' })))
    );
  }
});
