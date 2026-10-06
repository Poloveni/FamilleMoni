/* L'ancien site (GitHub Pages) installait un service worker pour son application mobile. Le site n'en a plus :
   ce fichier le remplace chez les visiteurs qui l'ont encore, vide son cache et se désinstalle, sans quoi ils
   continueraient de voir les anciennes pages. À garder tant que d'anciens visiteurs peuvent revenir. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(cles => Promise.all(cles.map(c => caches.delete(c))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(pages => pages.forEach(p => p.navigate(p.url)))
));
