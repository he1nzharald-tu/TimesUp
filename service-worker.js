// service-worker.js
self.addEventListener('install', function(event) {
    console.log('Service Worker installiert');
    self.skipWaiting();
  });
  
  self.addEventListener('fetch', function(event) {
    // Netzwerk direkt – Cache später möglich
    event.respondWith(fetch(event.request));
  });