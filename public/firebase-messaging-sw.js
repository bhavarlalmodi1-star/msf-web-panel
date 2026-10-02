importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js')

// These are public-facing config values (NEXT_PUBLIC_*)
const firebaseConfig = {
  apiKey: "AIzaSyBzW4hRn9TtwxlTcK4ofuRz9DLz9xN1y74",
  authDomain: "ssgms-project-dev.firebaseapp.com",
  projectId: "ssgms-project-dev",
  storageBucket: "ssgms-project-dev.firebasestorage.app",
  messagingSenderId: "53543759504",
  appId: "1:53543759504:web:e461f0a1c323d61e587215",
  measurementId: "G-3YSS20LBJQ",
}

firebase.initializeApp(firebaseConfig)

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {}
  const notificationTitle = data.title || 'SSGMSSS Trust'
  const notificationBody = data.body || ''
  const notificationIcon = data.icon || '/favicon.ico'

  self.registration.showNotification(notificationTitle, {
    body: notificationBody,
    icon: notificationIcon,
    data: { clickAction: data.click_action || '/' },
  })
})

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data?.clickAction || '/'
  event.notification.close()
  event.waitUntil(clients.openWindow(url))
})
