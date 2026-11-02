/* 서비스 워커: 앱 파일, 지도 스타일, 지도 타일을 오프라인에서도 쓸 수 있게 한다.
   __BUILD__ 는 배포할 때 앱 파일의 해시로 바뀐다. */
const BUILD = "__BUILD__";
const SHELL = "pm-shell-" + BUILD;
const CORE = "pm-map-core";          // 스타일·TileJSON·스프라이트·글꼴
const SAVED = "pm-tiles-saved";      // 오프라인 탭에서 저장한 타일 (index.html과 같은 이름)
const RUNTIME = "pm-tiles-runtime";  // 둘러보다 자동 저장된 타일
const RUNTIME_MAX = 4000;
const NET_TIMEOUT = 4000;

const ASSETS = [
  "./", "manifest.webmanifest", "access.json", "config.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "vendor/jszip.min.js", "vendor/leaflet-maplibre-gl.js",
  "vendor/maplibre-gl-csp.js", "vendor/maplibre-gl-csp-worker.js", "vendor/maplibre-gl.css",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("pm-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* 온라인이면 새 파일, 응답이 늦거나 없으면 저장본 */
async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then(async res => {
    if (res.ok) await cache.put(fallbackKey || req, res.clone());
    return res;
  });
  const stored = () => cache.match(fallbackKey || req);
  const late = new Promise(ok => setTimeout(() => ok(null), NET_TIMEOUT));
  try {
    const first = await Promise.race([net, late]);
    if (first) return first;
    return (await stored()) || (await net);
  } catch (e) {
    const hit = await stored();
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

let putCount = 0;
async function trimRuntime(cache) {
  const keys = await cache.keys();
  if (keys.length > RUNTIME_MAX) await Promise.all(keys.slice(0, keys.length - RUNTIME_MAX).map(k => cache.delete(k)));
}
async function tile(req, key) {
  const saved = await (await caches.open(SAVED)).match(key, { ignoreVary: true });
  if (saved) return saved;
  const runtime = await caches.open(RUNTIME);
  const hit = await runtime.match(key, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status !== 204) {
    await runtime.put(key, res.clone());
    if (++putCount % 200 === 0) trimRuntime(runtime);
  }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && req.cache === "no-store") return;   // 앱이 직접 저장하는 요청
  if (url.origin === location.origin) {
    if (/\/grid(-meta)?\.json$/.test(url.pathname)) return;   // 저장은 앱의 IndexedDB가 맡음
    if (req.mode === "navigate") return e.respondWith(networkFirst(req, SHELL, "./"));
    const live = url.pathname.match(/\/(access|config)\.json$/);   // 비밀번호·키 변경이 바로 반영되도록
    if (live) return e.respondWith(networkFirst(req, SHELL, live[1] + ".json"));
    return e.respondWith(cacheFirst(req, SHELL));
  }
  if (url.hostname === "tiles.openfreemap.org") {
    /* 타일 주소의 날짜 폴더가 바뀌어도 저장본을 찾도록 키에서 고정 */
    const m = url.pathname.match(/^\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/);
    if (m) return e.respondWith(tile(req, `${url.origin}/planet/_/${m[1]}`));
    if (url.pathname.startsWith("/natural_earth/")) return e.respondWith(tile(req, req.url));
    return e.respondWith(networkFirst(req, CORE));
  }
  if (url.hostname === "s3.amazonaws.com" && url.pathname.startsWith("/elevation-tiles-prod/")) return e.respondWith(tile(req, req.url));
});
