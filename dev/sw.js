// DEV only: a more specific scope prevents the production shell from replacing /dev/.
const DEV_SHELL_CACHE = 'budzet-rodzinny-dev-shell-v1';
const DEV_INDEX_URL = new URL('index.html', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode !== 'navigate' && !url.pathname.endsWith('/index.html')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(new Request(request, {cache:'no-store'}));
      if (response && response.ok) {
        const cache = await caches.open(DEV_SHELL_CACHE);
        await cache.put(DEV_INDEX_URL, response.clone());
      }
      return response;
    } catch (_) {
      const cache = await caches.open(DEV_SHELL_CACHE);
      const saved = await cache.match(DEV_INDEX_URL);
      return saved || new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>Połącz się z internetem, aby uruchomić DEV po raz pierwszy.</p>',
        {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}
      );
    }
  })());
});
