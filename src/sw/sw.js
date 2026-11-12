// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker. scripts/build.mjs writes dist/sw.js as a generated header
// defining CACHE (name with a content hash of everything precached) and
// PRECACHE (URLs relative to this script), followed by this file.
//
// Navigations: network first, falling back to the precached page (or the
// 404 page). Content-hashed assets: cache first. Everything else: network.
// The cached pages are never replaced by fresher network copies, so offline
// pages always match the assets cached alongside them.

const PREFIX = "examsnap-";
const HASHED = /\.[0-9a-f]{8}\.[a-z0-9]+$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// The page asks for this when the person clicks the update banner.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (HASHED.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const notFound = await cache.match(new URL("404.html", self.registration.scope).href);
    if (notFound) return notFound;
    throw err;
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request, { cacheName: CACHE });
  return hit ?? fetch(request);
}
