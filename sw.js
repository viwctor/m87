/* M87 — Service Worker (offline-first app shell) */
const CACHE = "m87-v0.8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./supabase.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  // Só gerencia arquivos do próprio site; recursos externos vão direto pela rede.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached || (request.mode === "navigate" ? caches.match("./index.html") : undefined));
      return cached || network;
    })
  );
});
