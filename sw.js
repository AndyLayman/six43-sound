const CACHE_VERSION = 'v23';
const APP_CACHE = `app-shell-${CACHE_VERSION}`;
const AUDIO_CACHE = `audio-${CACHE_VERSION}`;

// App shell — static assets to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/Sound-128-128.png',
  '/Favicon.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300&display=swap',
  'https://cdn.jsdelivr.net/npm/iconoir@7/css/iconoir.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

function isStorageUrl(url) {
  return url.includes('supabase.co') && url.includes('/storage/v1/object/');
}

// Install — cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== APP_CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Supabase storage (audio/images) — network first, cache fallback
  if (isStorageUrl(url)) {
    event.respondWith(
      fetch(event.request).then(response => {
        // Only cache successful audio/image responses
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && (contentType.startsWith('audio/') || contentType.startsWith('image/'))) {
          const clone = response.clone();
          caches.open(AUDIO_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        // Offline — try cache
        caches.open(AUDIO_CACHE).then(cache => cache.match(event.request)).then(cached =>
          cached || new Response('Audio not available offline', { status: 503 })
        )
      )
    );
    return;
  }

  // Supabase API calls — network only
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Navigation (HTML pages) — network first so code updates take effect immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() =>
        caches.match('/index.html').then(cached =>
          cached || new Response('Offline', { status: 503 })
        )
      )
    );
    return;
  }

  // Static assets (fonts, icons, JS libs) — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && (url.includes('fonts.g') || url.includes('unpkg.com') || url.includes('jsdelivr'))) {
          const clone = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
