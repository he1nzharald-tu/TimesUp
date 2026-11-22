// service-worker.js – Offline-Unterstützung für TimesUp
//
// Strategie: Cache first.
// Beim Installieren werden alle App-Dateien in einen versionierten Cache geladen.
// Danach kommen alle Anfragen zuerst aus dem Cache, nur Unbekanntes geht ins Netz.
//
// WICHTIG: Nach jeder Änderung an App-Dateien (HTML, CSS, JS, Karten, Sounds)
// CACHE_VERSION erhöhen – sonst bekommen installierte Apps die Änderung nicht.

const CACHE_VERSION = 'v16';
const CACHE_PREFIX = 'timesup-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
// Caches von Versionen ohne Update-Hinweis
const LEGACY_CACHES = ['timesup-v1', 'timesup-v2'];

// Alle App-Dateien: müssen alle geladen werden, sonst schlägt die Installation fehl.
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './css/base.css',
  './css/layout.css',
  './css/screens.css',
  './css/effects.css',
  './css/settings.css',
  './css/fonts.css',
  './fonts/fredoka/fredoka-latin-400-normal.woff2',
  './fonts/fredoka/fredoka-latin-700-normal.woff2',
  './fonts/fredoka/fredoka-latin-ext-400-normal.woff2',
  './fonts/fredoka/fredoka-latin-ext-700-normal.woff2',
  './js/main.js',
  './js/persist.js',
  './js/pwa.js',
  './js/state.js',
  './js/settings.js',
  './js/cards.js',
  './js/audio.js',
  './js/ui.js',
  './js/game.js',
  './js/filter.js',
  './js/settingsui.js',
  './js/teamview.js',
  './js/wakelock.js',
  './data/cards.json',
  './data/kategorien.json',
  './assets/Alarm.m4a',
  './assets/timer5.m4a'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache: 'reload' umgeht den HTTP-Cache des Browsers, damit wirklich der neue Stand landet.
    await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
    // Neue Versionen warten, bis in der App "Neu laden" angetippt wird (nie mitten im Spiel).
    // Ausnahme: Versionen v1/v2 kennen diesen Hinweis noch nicht – dort direkt übernehmen.
    const keys = await caches.keys();
    if (keys.some((key) => LEGACY_CACHES.includes(key))) await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

  // Die App lädt nur eigene Dateien; alles andere geht unverändert ins Netz
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
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
    if (response.ok && !request.headers.has('range')) {
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
