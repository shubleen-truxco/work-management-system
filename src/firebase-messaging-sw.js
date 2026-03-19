importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD7RyYAkGjS4qOwH35366qYFGLfMKDYLsc",
  authDomain: "workforce-management-1003.firebaseapp.com",
  projectId: "workforce-management-1003",
  storageBucket: "workforce-management-1003.firebasestorage.app",
  messagingSenderId: "428864371867",
  appId: "1:428864371867:web:788c425c0c3399be751a3e"
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage((payload) => {
  console.log('Background message:', payload);

  const { title, body } = payload.notification;

  self.registration.showNotification(title, {
    body,
    icon:  '/assets/icons/icon-72x72.png',
    badge: '/assets/icons/icon-72x72.png',
    data:  payload.data,
  });
  
self.addEventListener('notificationclick', function(event) {

  const data = event.notification.data;

  if (data?.clickAction === 'OPEN_TASK') {
    const taskId = data.taskId;

    event.waitUntil(
      clients.openWindow(`/tasks?taskId=${taskId}`)
    );
  }

});
  
});