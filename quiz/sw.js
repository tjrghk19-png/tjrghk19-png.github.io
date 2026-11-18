const CACHE = 'jq-v3';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './data/lang.json', './data/sisa.json', './data/ncs.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

/* 네트워크 우선 → 실패하면 캐시 (오프라인에서도 풀 수 있게) */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(hit => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return new Response('offline', { status: 503 });
    }))
  );
});
