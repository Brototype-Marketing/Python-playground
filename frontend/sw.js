// Service Worker to handle stdin input requests synchronously
const SW_VERSION = '1.0.0';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

let stdinResolver = null;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('/get-stdin')) {
    // Suspend the synchronous XHR until value is submitted
    event.respondWith(
      new Promise((resolve) => {
        if (stdinResolver) {
          // Resolve any previous hanging input request
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
});
