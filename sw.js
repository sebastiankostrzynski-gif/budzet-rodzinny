const SHELL_CACHE = 'budzet-rodzinny-shell-v68-mobile-navigation';
const RUNTIME_CACHE = 'budzet-rodzinny-runtime-v8';

const APP_SHELL = [
  './',
  './index.html',
  './queue.html',
  './inflows.html',
  './queue-transport.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);

    // index.html jest jedynym krytycznym plikiem. Ikony/manifest nie mogą
    // zablokować instalacji nowej wersji, gdy chwilowo zwrócą błąd CDN/GitHub.
    const criticalUrl = new URL('./index.html', self.registration.scope).href;
    const criticalResponse = await fetch(
      new Request(criticalUrl, { cache: 'no-store' })
    );

    if (!criticalResponse || !criticalResponse.ok) {
      throw new Error('Nie udało się zapisać krytycznego index.html.');
    }

    const authUrl = new URL('./private-budget.js', self.registration.scope).href;
    const authResponse = await fetch(authUrl, {cache:'no-store'});
    if (!authResponse.ok) throw new Error('Nie udało się pobrać modułu logowania.');
    await cache.put(authUrl,authResponse);
    await cache.put(criticalUrl, criticalResponse.clone());

    const optionalPaths = APP_SHELL.filter(path => path !== './index.html');
    await Promise.all(
      optionalPaths.map(async path => {
        try {
          const absoluteUrl = new URL(path, self.registration.scope).href;
          const response = await fetch(
            new Request(absoluteUrl, { cache: 'no-store' })
          );
          if (response && response.ok) {
            await cache.put(absoluteUrl, response.clone());
          }
        } catch (_) {
          // Pliki opcjonalne nie mogą zablokować aktualizacji aplikacji.
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('budzet-rodzinny-shell-') && key !== SHELL_CACHE
        )
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function matchShell_(request) {
  const cache = await caches.open(SHELL_CACHE);

  return (
    await cache.match(request, { ignoreSearch: true }) ||
    await cache.match('./index.html') ||
    await cache.match('./') ||
    null
  );
}

async function fetchAndCache_(request) {
  const response = await fetch(request, { cache: 'no-store' });

  if (response && response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html');

  if (isNavigation) {
    // TRUE LOCAL-FIRST:
    // podczas startu aplikacji NIE uruchamiamy sieci równolegle.
    // Najpierw oddajemy lokalny shell. Internet jest używany wyłącznie,
    // gdy na urządzeniu nie ma jeszcze żadnej kopii aplikacji.
    event.respondWith((async () => {
      const homePath = new URL(self.registration.scope).pathname;
      const isShell = url.pathname === homePath || url.pathname === homePath + 'index.html';
      if (!isShell) {
        const cache = await caches.open(SHELL_CACHE);
        const exact = await cache.match(request, { ignoreSearch: true });
        if (exact) return exact;
        try { return await fetchAndCache_(request); } catch (_) { return Response.error(); }
      }
      const cached = await matchShell_(request);
      if (cached) return cached;

      try {
        return await fetchAndCache_(request);
      } catch (_) {
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Budżet rodzinny</title><p>Brak połączenia i brak lokalnej kopii aplikacji.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Pozostałe lokalne pliki statyczne: także cache-first.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      return await fetchAndCache_(request);
    } catch (_) {
      return Response.error();
    }
  })());
});


