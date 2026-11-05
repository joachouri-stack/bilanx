/**
 * Service worker BILANX — volontairement minimal.
 * AUCUNE donnée de santé n'est mise en cache : les pages et les API passent toujours par le réseau
 * (rien ne reste sur un téléphone partagé après déconnexion). Seuls sont conservés :
 *   - les fichiers statiques de l'application (/_next/static : versionnés, sans donnée) ;
 *   - la page « hors ligne » et les icônes.
 */
const VERSION = 'bilanx-v1';
const SHELL = ['/hors-ligne.html', '/icons/icon-192.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages : toujours le réseau ; hors connexion, la page d'information (jamais une page en cache).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/hors-ligne.html')));
    return;
  }

  // Fichiers statiques versionnés (nom unique par contenu) : cache d'abord.
  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Tout le reste (API, documents, données) : comportement normal du navigateur, sans cache.
});
