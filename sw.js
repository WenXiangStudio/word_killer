const CACHE_NAME = 'wordkiller-v5';
const APP_SHELL = [
  new URL('./', self.location).toString(),
  new URL('index.html', self.location).toString(),
  new URL('word_books.json', self.location).toString(),
  new URL('phonetic_db.js', self.location).toString(),
  new URL('manifest.json', self.location).toString(),
  new URL('icon-192.png', self.location).toString(),
  new URL('icon-512.png', self.location).toString()
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNetworkFirst =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/word_books.json') ||
    url.pathname.endsWith('/manifest.json');

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(APP_SHELL[1]);
          }
          return caches.match(event.request, {ignoreSearch: true});
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, {ignoreSearch: true}).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || !networkResponse.ok) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match(APP_SHELL[1]);
          }
          return caches.match(event.request, {ignoreSearch: true});
        });
    })
  );
});
