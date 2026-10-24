/**
 * Service worker for Abhyas PWA.
 *
 * Provides a basic offline experience: when the network is unavailable and
 * a navigation request fails, show /offline instead of the browser's default
 * "no internet" page.
 *
 * This is intentionally conservative:
 * - Only caches the offline page itself
 * - Does NOT cache authenticated API responses (Supabase, user data)
 * - Does NOT cache app pages (they depend on user state and database calls)
 * - Does NOT attempt to serve stale content
 *
 * White-label deployments can extend this with their own caching strategy,
 * but the baseline is safe: offline means offline, with a clear message.
 *
 * Version is auto-incremented on each build to force updates.
 */

const CACHE_NAME = "abhyas-offline-v1";
const OFFLINE_URL = "/offline";

// Install: cache the offline page
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      // Skip waiting so the new service worker activates immediately
      await self.skipWaiting();
    })()
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
      // Take control of all clients immediately
      await self.clients.claim();
    })()
  );
});

// Fetch: serve the offline page when a navigation request fails
self.addEventListener("fetch", (event) => {
  // Only handle navigation requests (page loads, not API calls or assets)
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Try the network first
        const response = await fetch(event.request);
        return response;
      } catch {
        // Network failed; serve the cached offline page
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_URL);
        return cachedResponse || new Response("Offline", { status: 503 });
      }
    })()
  );
});
