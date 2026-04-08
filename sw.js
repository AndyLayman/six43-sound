const CACHE_VERSION = 'v14';
const APP_CACHE = `app-shell-${CACHE_VERSION}`;

// App shell — static assets to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/favicon.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300&display=swap',
  'https://cdn.jsdelivr.net/npm/iconoir@7/css/iconoir.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Install — cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean ALL old caches (including audio caches)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Supabase requests (storage + API) — always go to network, no caching
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response('Offline', { status: 503 })
      )
    );
    return;
  }

  // App shell & static assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for static resources
        if (response.ok && (url.includes('fonts.g') || url.includes('unpkg.com') || url.includes('jsdelivr'))) {
          const clone = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
