const CACHE_NAME = 'shareli-cache-v41';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css?v=41',
  '/app.js?v=41',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/logo.jpg',
  '/badge-mono.png',
  '/faq.html',
  '/privacy.html',
  '/terms.html',
  '/about.html',
  '/contact.html',
  '/blog.html'
];

// Install Event: Cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache', CACHE_NAME);
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Force the waiting service worker to become the active service worker immediately.
  self.skipWaiting();
});

// Activate Event: Clean up all old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensure that the new service worker takes control immediately across all tabs.
  self.clients.claim();
  // On localhost, self-unregister to ensure development changes are always live
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    self.registration.unregister();
  }
});

// Fetch Event: Smart routing
self.addEventListener('fetch', (event) => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Security & Stability: ONLY intercept HTTP and HTTPS requests.
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }
  
  // Skip WebSocket connections or API endpoints
  if (event.request.url.includes('/socket.io') || event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return;
  }

  // ON LOCALHOST / DEV: Always fetch fresh from network to prevent dev caching issues
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  const url = event.request.url;
  const isHtml = event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));
  const isCoreAsset = url.includes('styles.css') || url.includes('app.js') || url.includes('?v=');

  // Network-First strategy for HTML and core application bundles (CSS, JS)
  // Ensures fresh code is always delivered when connected, falling back to cache if offline
  if (isHtml || isCoreAsset) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (isHtml) return caches.match('/index.html') || caches.match('/');
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // Cache-First with background revalidation for immutable static assets (images, fonts)
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            });
          }
        }).catch(() => {});
        return response;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache).catch(() => {});
        });
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response('', { status: 408, statusText: 'Offline or network error' });
        });
      });
    }).catch(() => {
      return new Response('', { status: 408, statusText: 'Offline or network error' });
    })
  );
});

// Notification click handler — brings the app tab into focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a Shareli tab is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
