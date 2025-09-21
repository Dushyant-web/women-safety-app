// Import the Firebase scripts for service worker
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

// Your Firebase config (same as index.html)
const firebaseConfig = {
  apiKey: "AIzaSyCvoJdOzp9v8aWdnWhGpoBrB_ZOBh-L648",
  authDomain: "women-saftey-a3bac.firebaseapp.com",
  projectId: "women-saftey-a3bac",
  storageBucket: "women-saftey-a3bac.firebasestorage.app",
  messagingSenderId: "40368489597",
  appId: "1:40368489597:web:cba8693d99900ea5461d14"
};

firebase.initializeApp(firebaseConfig);

// Retrieve firebase messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = "🚨 SOS Alert";
  const mapsUrl = payload.data?.mapsUrl || `https://maps.google.com/?q=${payload.data.lat},${payload.data.lon}`;


  const notificationOptions = {
    body: `Location: ${payload.data.lat}, ${payload.data.lon} (Tap to open in Maps)`,
    icon: "/sos-icon.png",
    data: { url: mapsUrl }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});