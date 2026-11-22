// service-worker.js – Offline-Unterstützung für TimesUp
//
// Strategie: Cache first.
// Beim Installieren werden alle App-Dateien in einen versionierten Cache geladen.
// Danach kommen alle Anfragen zuerst aus dem Cache, nur Unbekanntes geht ins Netz.
//
// WICHTIG: Nach jeder Änderung an App-Dateien (HTML, CSS, JS, Karten, Sounds)
// CACHE_VERSION erhöhen – sonst bekommen installierte Apps die Änderung nicht.

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'timesup-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

// Eigene Dateien: müssen alle geladen werden, sonst schlägt die Installation fehl.
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './css/startscreen.css',
  './js/app.js',
  './js/db_Karten.xlsx',
  './assets/Alarm.m4a',
  './assets/timer5.m4a'
];

// Fremde Dateien: werden nach Möglichkeit mitgeladen, ein Fehler bricht die Installation nicht ab.
const EXTERNAL_FILES = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;700&display=swap'
];

// Hosts, deren Antworten beim ersten Abruf zusätzlich zwischengespeichert werden
// (z. B. die eigentlichen Schriftdateien, die erst das Google-Fonts-CSS nachlädt).
const RUNTIME_CACHE_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' umgeht den HTTP-Cache des Browsers, damit wirklich der neue Stand landet.
    await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
    await Promise.all(EXTERNAL_FILES.map(async (url) => {
      try {
        const response = await fetch(url, { mode: 'cors', cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (err) {
        console.warn('[SW] Externe Datei nicht vorab geladen:', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !RUNTIME_CACHE_HOSTS.includes(url.hostname)) return;

  event.respondWith(handleFetch(request, sameOrigin));
});

async function handleFetch(request, sameOrigin) {
  const cache = await caches.open(CACHE_NAME);

  // Seitenaufrufe (auch mit ?param oder #hash) immer mit der gespeicherten App beantworten.
  if (request.mode === 'navigate') {
    const page = await cache.match('./index.html');
    if (page) return page;
    return fetch(request);
  }

  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    // Safari fragt Audio mit Range-Headern an und erwartet eine 206-Antwort.
    const range = request.headers.get('range');
    return range ? rangeResponse(cached, range) : cached;
  }

  try {
    const response = await fetch(request);
    const cacheable = response.ok || (!sameOrigin && response.type === 'opaque');
    if (cacheable && !request.headers.has('range')) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline – Datei nicht im Cache.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function rangeResponse(cachedResponse, rangeHeader) {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!match) return cachedResponse;

  const blob = await cachedResponse.blob();
  const size = blob.size;
  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);

  if (start === null) {        // bytes=-500 → die letzten 500 Bytes
    start = Math.max(0, size - (end ?? 0));
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }

  if (start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` }
    });
  }

  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}
