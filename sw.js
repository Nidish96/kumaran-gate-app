/* Service worker: receives notifications while the app is closed. The Firebase settings are passed in
   by app.js when it registers this file (sw.js?cfg=...), so nothing here needs editing. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

var cfg = {};
try { cfg = JSON.parse(new URL(self.location.href).searchParams.get('cfg') || '{}'); } catch (e) { cfg = {}; }
if (cfg.apiKey) {
  firebase.initializeApp(cfg);
  // Notifications sent by the gate include their own title and text, so Firebase shows them automatically
  // and opens the app when tapped.
  firebase.messaging();
}

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* network only; needed so phones offer "Install app" */ });
