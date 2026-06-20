// TracingPad service worker — cache-first for the app shell so the kid can
// keep practising without WiFi. Bump CACHE_VERSION any time the cached files
// (HTML / manifest / icon / Tailwind CDN) change so the SW re-downloads them.
const CACHE_VERSION = 'tracingpad-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap',
];

self.addEventListener('install', (event) => {
  // Pre-cache the app shell. addAll() rejects if any URL fails — so we
  // best-effort each entry individually to survive a flaky CDN at install time.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => { /* tolerate single-asset failures */ })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop caches from older versions and claim open tabs immediately.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GETs; let everything else pass through.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Skip Google Analytics / gtag — those should always hit the network when
  // online and silently fail when offline (analytics is not core UX).
  if (url.hostname.includes('googletagmanager.com') ||
      url.hostname.includes('google-analytics.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache same-origin and opaque (CDN) responses opportunistically.
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        // Offline + not cached: for navigations fall back to index.html.
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
