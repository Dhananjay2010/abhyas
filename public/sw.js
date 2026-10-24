/**
 * Service worker for Abhyas PWA.
 *
 * Provides a basic offline experience: when the network is unavailable and
 * a navigation request fails, show /offline.html instead of the browser's
 * default "no internet" page.
 *
 * This is intentionally conservative:
 * - Only caches the offline page itself (a static HTML file with inlined icon)
 * - Does NOT cache authenticated API responses (Supabase, user data)
 * - Does NOT cache app pages (they depend on user state and database calls)
 * - Does NOT attempt to serve stale content
 *
 * White-label deployments can extend this with their own caching strategy,
 * but the baseline is safe: offline means offline, with a clear message.
 *
 * Build ID is injected at build time by scripts/inject-build-id.ts.
 */

// XyDO9vC9nYnH1fOsWyas9 is replaced at build time with the Next.js build ID or commit SHA
const BUILD_ID = "XyDO9vC9nYnH1fOsWyas9";
const CACHE_NAME = `abhyas-offline-${BUILD_ID}`;
const OFFLINE_URL = "/offline.html";

// Install: cache the offline page
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
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
      await self.clients.claim();
    })()
  );
});

/**
 * Check if a request should be intercepted for offline fallback.
 * Only navigation and RSC requests; never Supabase, /auth, or static assets.
 */
function shouldInterceptForOffline(request) {
  const url = new URL(request.url);

  // Never intercept Supabase API calls
  if (url.hostname.includes("supabase.co")) {
    return false;
  }

  // Never intercept /auth callbacks
  if (url.pathname.startsWith("/auth")) {
    return false;
  }

  // Intercept full-page navigations
  if (request.mode === "navigate") {
    return true;
  }

  // Intercept Next.js RSC data requests (client-side route transitions)
  if (url.pathname.startsWith("/_next/data/")) {
    return true;
  }

  return false;
}

// Fetch: serve the offline page when a navigation request fails
self.addEventListener("fetch", (event) => {
  if (!shouldInterceptForOffline(event.request)) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_URL);
        return cachedResponse || new Response("Offline", { status: 503 });
      }
    })()
  );
});
