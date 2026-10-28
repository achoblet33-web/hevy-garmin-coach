// KINTRA standalone PWA. Cache only static public assets; never cache any workout API or health data.
const CACHE = "kintra-ui-11";
const STATIC = [
  "./index.html",
  "./app.css?v=11",
  "./app.mjs?v=11",
  "./manifest.webmanifest",
  "./kintra-icon.svg",
  "./kintra-icon-192.png",
  "./kintra-icon-512.png",
  "./kintra-logo.svg",
  "./kintra-coach.mjs",
  "./kintra-hub.mjs",
  "./kintra-weather.mjs",
  "./kintra-insights.mjs",
  "./credentials.mjs",
  "./after-run.mjs",
  "./workout-reconciliation.mjs",
  "../plan-engine.mjs"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith("trainsync-coach-ui-")||k.startsWith("kintra-ui-"))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.startsWith("/v3/") || url.pathname.startsWith("/api/"))return;
  const allowed=url.pathname.includes("/runna-next/") || url.pathname.endsWith("/plan-engine.mjs");
  if(!allowed)return;
  const key=request.mode==="navigate" ? new Request("./index.html") : request;
  event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{
    if(response.ok && response.type!=="opaque")caches.open(CACHE).then(cache=>cache.put(key,response.clone()));
    return response;
  }).catch(async()=>await caches.match(key) || new Response("Hors connexion : aucun cache disponible.",{status:503})));
});