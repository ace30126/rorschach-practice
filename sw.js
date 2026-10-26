// 앱 화면 파일만 캐시한다. API 호출은 캐시하지 않는다.
const CACHE = 'rp-v3';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './inkblot.js', './persona.js',
  './llm.js', './mock.js', './scoring.js', './manifest.webmanifest', './icon.svg',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// 네트워크 우선, 실패하면 캐시 (수정한 코드가 바로 반영되도록)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
