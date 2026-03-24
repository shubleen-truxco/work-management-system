importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyD7RyYAkGjS4qOwH35366qYFGLfMKDYLsc",
  authDomain:        "workforce-management-1003.firebaseapp.com",
  projectId:         "workforce-management-1003",
  storageBucket:     "workforce-management-1003.firebasestorage.app",
  messagingSenderId: "428864371867",
  appId:             "1:428864371867:web:788c425c0c3399be751a3e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  // ── FIX 2: safely extract from data OR notification ──
  const data         = payload.data         || {};
  const notification = payload.notification || {};

  const title  = data.title  || notification.title  || 'New Message';
  const body   = data.body   || notification.body   || 'You have a new message';
  const chatId = data.chatId || '';
  const silent = data.silent === 'true';

  // ── Skip silent notifications (online user multi-device sync) ──
  if (silent) {
    console.log('[SW] Silent notification — skipping display');
    return;
  }

  return self.registration.showNotification(title, {
    body,
    icon:    '/assets/icons/icon-192x192.png',
    badge:   '/assets/icons/icon-72x72.png',
    tag:     chatId || 'default',
    renotify: true,
    data: {
      chatId,
      url: chatId ? `/admin/messages` : '/admin/messages',
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const url    = '/admin/messages';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type:   'NOTIFICATION_CLICK',
            chatId: chatId,
            url,
          });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});