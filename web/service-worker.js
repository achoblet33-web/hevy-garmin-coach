const RELEASE = "200";
const CACHE_NAME = `trainsync-release-${RELEASE}`;

const RELEASE_ASSETS = [
  `./styles.css?v=${RELEASE}`,
  `./connection.css?v=${RELEASE}`,
  `./v13.css?v=${RELEASE}`,
  `./v14.css?v=${RELEASE}`,
  `./v15.css?v=${RELEASE}`,
  `./v16.css?v=${RELEASE}`,
  `./v17.css?v=${RELEASE}`,
  `./v18.css?v=${RELEASE}`,
  `./v19.css?v=${RELEASE}`,
  `./v20.css?v=${RELEASE}`,
  `./app.js?v=${RELEASE}`,
  `./enriched.js?v=${RELEASE}`,
  `./v15.js?v=${RELEASE}`,
  `./v16.js?v=${RELEASE}`,
  `./v17.js?v=${RELEASE}`,
  `./v18.js?v=${RELEASE}`,
  `./v19.js?v=${RELEASE}`,
  `./v20.js?v=${RELEASE}`,
  `./manifest.webmanifest?v=${RELEASE}`,
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(RELEASE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key.startsWith("trainsync")).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Always get a fresh HTML shell. This prevents Safari from loading a page
  // that references an older set of TrainSync scripts.
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  const isReleaseAsset = event.request.destination === "script" ||
    event.request.destination === "style" ||
    url.pathname.endsWith(".webmanifest");

  if (isReleaseAsset) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          if (response.ok && url.searchParams.get("v") === RELEASE) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
