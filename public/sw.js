const CACHE_NAME = "powderdays-v2"

// Core shell assets — these are the Vite-built files that make the app work offline
// Note: Vite generates hashed filenames like /assets/index-abc123.js
// We cache the index.html + the manifest; Vite chunks cache themselves on first load
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  // Take control immediately without waiting for old tabs to close
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Delete old caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Never cache API calls or Supabase requests
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.hostname !== self.location.hostname
  ) {
    return // let the browser handle it normally
  }

  // Navigations (and the bare index.html) must be network-first. index.html
  // references build-hashed asset filenames, so a cached copy goes stale the
  // moment a new build ships — its /assets/index-<hash>.js 404s and the app
  // white-screens. Falling back to cache only when the network fails keeps the
  // offline behaviour that made this cache-first in the first place.
  const isNavigation =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html"

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (event.request.method === "GET" && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() =>
          // Offline — serve the last good shell, falling back to "/" for deep links
          caches.match(event.request).then((cached) => cached || caches.match("/"))
        )
    )
    return
  }

  // For everything else (static assets), try cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for static assets
        if (
          event.request.method === "GET" &&
          response.status === 200 &&
          (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/resorts/"))
        ) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
    })
  )
})
