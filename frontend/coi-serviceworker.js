// COI (Cross-Origin Isolation) Service Worker
// Injects COOP + COEP headers so the page becomes cross-origin isolated.
// This enables SharedArrayBuffer, which is required for Atomics.wait()
// (blocking the Python worker thread while waiting for terminal input).

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Skip opaque requests to avoid errors
  if (event.request.cache === 'only-if-cached' &&
      event.request.mode !== 'same-origin') return;

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        if (resp.status === 0) return resp;
        const h = new Headers(resp.headers);
        h.set('Cross-Origin-Opener-Policy',   'same-origin');
        h.set('Cross-Origin-Embedder-Policy', 'credentialless');
        return new Response(resp.body, {
          status:     resp.status,
          statusText: resp.statusText,
          headers:    h,
        });
      })
      .catch(() => fetch(event.request))
  );
});
