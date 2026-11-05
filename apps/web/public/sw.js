/**
 * Service worker BILANX — volontairement minimal.
 * Notifications : affiche les rappels de prise reçus (chiffrés de bout en bout) et ouvre BILANX au toucher.
 * AUCUNE donnée de santé n'est mise en cache : les pages et les API passent toujours par le réseau
 * (rien ne reste sur un téléphone partagé après déconnexion). Seuls sont conservés :
 *   - les fichiers statiques de l'application (/_next/static : versionnés, sans donnée) ;
 *   - la page « hors ligne » et les icônes.
 */
const VERSION = 'bilanx-v2';
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

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'BILANX', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'bilanx',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/medicaments' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/medicaments', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
