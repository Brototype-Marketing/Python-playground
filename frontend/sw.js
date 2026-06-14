// Service Worker to handle stdin input requests synchronously & inject COI headers
const SW_VERSION = '1.1.0';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

let stdinResolver = null;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Handle stdin endpoints (intercept locally)
  if (url.pathname.endsWith('/get-stdin')) {
    event.respondWith(
      new Promise((resolve) => {
        if (stdinResolver) {
          stdinResolver(new Response('', { status: 200 }));
        }
        stdinResolver = resolve;
      })
    );
  } else if (url.pathname.endsWith('/submit-stdin')) {
    const value = url.searchParams.get('value') || '';
    if (stdinResolver) {
      stdinResolver(
        new Response(value, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
      );
      stdinResolver = null;
    }
    event.respondWith(new Response('OK', { status: 200 }));
  } else if (url.pathname.endsWith('/clear-stdin')) {
    if (stdinResolver) {
      stdinResolver(new Response('', { status: 200 }));
      stdinResolver = null;
    }
    event.respondWith(new Response('OK', { status: 200 }));
  } 
  // 2. Handle all other assets and inject COOP + COEP headers for Cross-Origin Isolation (COI)
  else {
    // Skip opaque requests to avoid errors
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.status === 0) return resp;
          const h = new Headers(resp.headers);
          h.set('Cross-Origin-Opener-Policy', 'same-origin');
          h.set('Cross-Origin-Embedder-Policy', 'credentialless');
          return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers: h
          });
        })
        .catch(() => fetch(event.request))
    );
  }
});
