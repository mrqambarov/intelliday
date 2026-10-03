const CACHE_NAME = 'intelliday-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/index.css?v=3.2',
  './css/components.css?v=3.2',
  './css/responsive.css?v=3.2',
  './js/storage.js?v=3.2',
  './js/notifications.js?v=3.2',
  './js/assistant.js?v=3.2',
  './js/schedule.js?v=3.2',
  './js/pomodoro.js?v=3.2',
  './js/habits.js?v=3.2',
  './js/views.js?v=3.2',
  './js/auth.js?v=3.2',
  './js/corporate.js?v=3.2',
  './js/app.js?v=3.2',
  './assets/icon.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Professional Notification Click & Action Dispatcher
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const taskId = event.notification.data ? event.notification.data.taskId : null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (action && taskId) {
            client.postMessage({
              type: 'NOTIFICATION_ACTION',
              action: action,
              taskId: taskId
            });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});
