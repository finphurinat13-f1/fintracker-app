// Bump CACHE on every shippable change so the activate step purges old caches.
const CACHE = 'fintracker-v4';

// Stable, versioned runtime libs — safe to precache. The app HTML is NOT here:
// it must always come network-first so new deploys reach users immediately.
const PRECACHE = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,700;1,6..96,400&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { mode: 'no-cors' })))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Never intercept Firebase / Firestore — always go to network.
  if (url.includes('firestore') || url.includes('firebase') || url.includes('identitytoolkit')) return;
  // Same for our own API: responses are per-user and time-sensitive, so they must
  // never land in the shared stale-while-revalidate bucket below.
  if (new URL(url, self.location.origin).pathname.startsWith('/api/')) return;

  const isDocument =
    e.request.mode === 'navigate' ||
    e.request.destination === 'document' ||
    url.endsWith('/') ||
    url.endsWith('/index.html');

  if (isDocument) {
    // NETWORK-FIRST for the app shell: latest deploy wins; cache is only an offline fallback.
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Static assets / libs: stale-while-revalidate (fast, refreshes in background).
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
