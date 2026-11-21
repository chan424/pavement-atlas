// Pavement Atlas service worker: offline app shell, cached model and runtime.
const VERSION = 'pa-v2.0.0';
const SHELL = 'pa-shell-' + VERSION;
const MODEL = 'pa-model-v1'; // model bytes are checksum-verified and change only with config.json
const RUNTIME = 'pa-runtime-v1';
const SHELL_FILES = [
 "./",
 "./index.html",
 "./style.css",
 "./app.js",
 "./shared.js",
 "./storage.js",
 "./study.js",
 "./ui.js",
 "./home.js",
 "./live.js",
 "./mapview.js",
 "./help.js",
 "./tour.js",
 "./manifest.webmanifest",
 "./assets/atlas.svg",
 "./assets/icons/icon-192.png",
 "./assets/icons/icon-512.png",
 "./assets/icons/maskable-512.png",
 "./assets/icons/apple-touch-icon.png",
 "./data/manifest.json",
 "./data/evaluation.json",
 "./model/config.json",
 "./model/detector.js",
 "./model/decode.mjs",
 "./model/inference-worker.mjs",
 "./model/vendor/ort.wasm.min.mjs",
 "./model/MODEL_CARD.md",
 "./data/images/India_003567.jpg",
 "./data/images/India_001687.jpg",
 "./data/images/India_001421.jpg",
 "./data/images/India_006888.jpg",
 "./data/images/India_002551.jpg",
 "./data/images/India_002279.jpg",
 "./data/images/India_000528.jpg",
 "./data/images/India_003539.jpg",
 "./data/images/India_008982.jpg",
 "./data/images/India_000416.jpg",
 "./data/images/India_000504.jpg",
 "./data/images/India_000440.jpg",
 "./data/images/India_002293.jpg",
 "./data/images/India_008279.jpg",
 "./data/images/India_002278.jpg",
 "./data/images/India_006919.jpg"
];
const MODEL_FILES = ['./model/india-yolo11n.onnx', './model/vendor/ort-wasm-simd-threaded.wasm', './model/vendor/ort-wasm-simd-threaded.mjs'];

self.addEventListener('install', event => {
  // Cache each file separately so one missing optional asset cannot block offline support.
  event.waitUntil(caches.open(SHELL)
    .then(c => Promise.allSettled(SHELL_FILES.map(f => c.add(new Request(f, {cache: 'reload'})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('pa-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'cache-model') event.waitUntil(caches.open(MODEL).then(c => c.addAll(MODEL_FILES)));
});

const isModel = url => /\/model\/(india-yolo11n\.onnx|vendor\/ort-wasm-simd-threaded\.(wasm|mjs))$/.test(url.pathname);
async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request, {ignoreSearch: true});
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) cache.put(request, res.clone());
  return res;
}
async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, {ignoreSearch: true}) || (request.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    throw err;
  }
}
async function tile(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone());
      const keys = await cache.keys();
      if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) cache.delete(k);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    if (isModel(url)) event.respondWith(cacheFirst(request, MODEL));
    else if (url.pathname.endsWith('/assets/source.zip')) return;
    else event.respondWith(networkFirst(request, SHELL));
  } else if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(request, RUNTIME));
  } else if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(tile(request));
  }
});
