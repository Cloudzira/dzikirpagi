const CACHE = 'dzikirku-v5';
const ASSETS = [
  './', './index.html', './manifest.json', './favicon.ico',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Audio di folder /audio/: simpan utuh di cache, layani permintaan Range (dibutuhkan Safari/iOS)
async function audioResponse(req) {
  try {
    const cache = await caches.open(CACHE);
    const url = req.url.split('#')[0];
    let res = await cache.match(url);
    if (!res) {
      const net = await fetch(url);
      const type = net.headers.get('content-type') || '';
      if (!net.ok || type.includes('text/html')) return net;
      await cache.put(url, net.clone());
      res = net;
    }
    const range = req.headers.get('range');
    if (!range) return res;
    const buf = await res.arrayBuffer();
    const size = buf.byteLength;
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return res;
    let s, e;
    if (m[1] === '') { s = Math.max(0, size - parseInt(m[2], 10)); e = size - 1; }
    else { s = parseInt(m[1], 10); e = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1; }
    if (s >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    return new Response(buf.slice(s, e + 1), {
      status: 206,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'audio/mpeg',
        'Content-Range': 'bytes ' + s + '-' + e + '/' + size,
        'Content-Length': String(e - s + 1)
      }
    });
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return; // audio online & font dari luar tidak di-cache
  if (u.pathname.includes('/audio/')) { e.respondWith(audioResponse(e.request)); return; }
  if (e.request.headers.has('range')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then(r => r || caches.match('./index.html'))
      )
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
