const CACHE_NAME = 'ems-insight-v1';
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png'
];

const API_CACHE_URLS = [
  '/api/calls/active',
  '/api/stats',
  '/api/config/google-maps-key'
];

// Install event - cache static resources
self.addEventListener('install', event => {
  console.log('SW: Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching static resources');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('SW: Activating service worker');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => {
          return fetch(request)
            .then(response => {
              // Cache successful API responses
              if (response.ok && API_CACHE_URLS.includes(url.pathname)) {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Return cached version when offline
              return cache.match(request)
                .then(cachedResponse => {
                  if (cachedResponse) {
                    return cachedResponse;
                  }
                  // Return offline placeholder for uncached API calls
                  return new Response(JSON.stringify({ 
                    error: 'Offline', 
                    message: 'No network connection available' 
                  }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                  });
                });
            });
        })
    );
    return;
  }

  // Handle static resources
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request)
          .then(response => {
            // Cache successful responses for static resources
            if (response.ok && request.method === 'GET') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, responseClone);
                });
            }
            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/');
            }
            throw error;
          });
      })
  );
});

// Background sync for when connection is restored
self.addEventListener('sync', event => {
  console.log('SW: Background sync triggered');
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Refresh cached data when connection is restored
      caches.open(CACHE_NAME)
        .then(cache => {
          return Promise.all(
            API_CACHE_URLS.map(url => {
              return fetch(url)
                .then(response => {
                  if (response.ok) {
                    cache.put(url, response.clone());
                  }
                  return response;
                })
                .catch(err => console.log('SW: Failed to refresh', url, err));
            })
          );
        })
    );
  }
});

// Push notifications for emergency alerts
self.addEventListener('push', event => {
  console.log('SW: Push notification received');
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.message || 'New emergency alert',
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        {
          action: 'view',
          title: 'View Dashboard'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'EMS Alert', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('SW: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});