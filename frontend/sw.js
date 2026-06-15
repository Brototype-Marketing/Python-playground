// Service Worker to handle stdin input requests, cache assets, and inject COI headers
const SW_VERSION = '1.2.0';
const CACHE_NAME = 'brototype-ctc-cache-v1.2.0';

const PRECACHE_ASSETS = [
  './',
  'index.html',
  'admin.html',
  'app.js',
  'style.css',
  'logo.svg',
  'coi-serviceworker.js',
  'pyodide-worker.js'
];

// 1. Install Event: Precache core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching local static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

let stdinResolver = null;

// Helper to inject COOP/COEP headers safely
function injectCOIHeaders(resp) {
  if (!resp || resp.status === 0 || resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
    return resp;
  }
  if (resp.headers.has('Cross-Origin-Opener-Policy')) {
    return resp;
  }
  try {
    const h = new Headers(resp.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: h
    });
  } catch (e) {
    console.warn('[Service Worker] Failed to inject COI headers:', e);
    return resp;
  }
}

// 3. Fetch Event: Handle stdin interception, API bypass, and asset caching
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A. Intercept stdin input requests (communicated synchronously from pyodide-worker)
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
  
  // B. Bypass API requests (always hit network, do not cache)
  else if (url.pathname.includes('/api/')) {
    return; // Let browser process normally
  }

  // C. Handle files (Local Assets & CDN Libraries)
  else {
    // Skip opaque requests to avoid errors in certain modes
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
      return;
    }

    const isCDN = url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('cdn.jsdelivr.net');

    if (isCDN) {
      // Cache-First strategy for CDN resources (immutable versioned files like CodeMirror, Pyodide)
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          });
        })
      );
    } else {
      // Network-First strategy for same-origin local assets
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return injectCOIHeaders(networkResponse);
          })
          .catch(() => {
            return caches.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                return injectCOIHeaders(cachedResponse);
              }
              return new Response('Offline and resource not cached.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
          })
      );
    }
  }
});
