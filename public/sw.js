const CACHE_NAME = "flight-connection-risk-checker-v1.3.0";
const APP_SHELL = [
  "/",
  "/index.html",
  "/src/main.js",
  "/src/styles.css",
  "/src/lib/airports.js",
  "/src/lib/clipboard.js",
  "/src/lib/connection-questions.js",
  "/src/lib/customer-notice.js",
  "/src/lib/monitoring-scope.js",
  "/src/lib/route-builder.js",
  "/src/lib/routes.js",
  "/src/lib/time.js",
  "/src/lib/risk-engine/engine.js",
  "/src/lib/risk-engine/risk-rules.js",
  "/data/airports.js",
  "/data/common-routes.js",
  "/manifest.webmanifest",
  "/robots.txt",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("flight-connection-risk-checker-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    }),
  );
});
