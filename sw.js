/*
 * 期末急救分诊台 — Service Worker
 * 子路径部署(GitHub Pages /exam-saving/),缓存键与请求都用相对路径。
 * 策略:应用外壳 cache-first;其他同源 GET 网络优先、失败回缓存。
 */
var CACHE = 'first-aid-triage-v3';
var SHELL = [
  './',
  './index.html',
  './css/style.css',
  './css/vendor/animate.min.css',
  './js/calc.js',
  './js/app.js',
  './js/vendor/confetti.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  var isShell = SHELL.some(function (p) {
    return new URL(req.url).pathname === new URL(p, self.location.origin).pathname;
  });

  if (isShell) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(req);
      })
    );
    return;
  }

  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req);
    })
  );
});
