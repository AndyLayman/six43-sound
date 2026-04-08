const CACHE_VERSION = 'v4';
const APP_CACHE = `app-shell-${CACHE_VERSION}`;
const AUDIO_CACHE = `audio-${CACHE_VERSION}`;

// App shell — static assets to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/favicon.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300&display=swap',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

// Extract the storage path from a Supabase signed/public URL
// e.g. ".../object/sign/media/player-2-combo?token=..." → "player-2-combo"
function getStorageKey(url) {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/(.+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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

  // Supabase storage requests (audio/images) — cache with storage-path key
  const storageKey = getStorageKey(url);
  if (storageKey) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        // Check if we have this storage path cached (under any signed URL)
        const cachedResponse = await cache.match(storageKey);
        if (cachedResponse) return cachedResponse;

        // Not cached — fetch from network
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            // Store with the storage path as key, not the signed URL
            cache.put(storageKey, response.clone());
          }
          return response;
        } catch {
          // Offline and not cached
          return new Response('Audio not available offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Supabase API calls — network only (DB queries, auth, etc.)
  if (url.includes('supabase.co') && !storageKey) {
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
        // If it's a navigation request, serve the cached index
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
