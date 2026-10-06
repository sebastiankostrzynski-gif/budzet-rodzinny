const CACHE_NAME = 'budzet-rodzinny-shell-v4-local-first';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function fetchAndUpdate_(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });

    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (_) {
    return null;
  }
}

async function getShellFromCache_(request) {
  const cache = await caches.open(CACHE_NAME);

  return (
    await cache.match(request, { ignoreSearch: true }) ||
    await cache.match('./index.html') ||
    await cache.match('./') ||
    null
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isShellHtml =
    request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html');

  // Sieć rusza równolegle wyłącznie po to, aby odświeżyć cache.
  // event.waitUntil wywołujemy od razu w handlerze (ważne dla iOS/WebKit).
  const networkUpdate = fetchAndUpdate_(request);
  event.waitUntil(networkUpdate.then(() => undefined));

  if (isShellHtml) {
    event.respondWith((async () => {
      // LOCAL-FIRST: jeżeli powłoka jest w telefonie, zwracamy ją natychmiast.
      // Wynik networkUpdate nie blokuje renderu i zostanie użyty dopiero wtedy,
      // gdy nie mamy żadnej lokalnej kopii.
      const cached = await getShellFromCache_(request);
      if (cached) return cached;

      const network = await networkUpdate;
      if (network) return network;

      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Budżet rodzinny</title><p>Brak połączenia i brak lokalnej kopii aplikacji.</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const network = await networkUpdate;
    return network || Response.error();
  })());
});
