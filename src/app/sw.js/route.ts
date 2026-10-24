/**
 * Service worker route handler.
 *
 * Serves the service worker JavaScript with a dynamically generated cache
 * version based on VERCEL_GIT_COMMIT_SHA or a build-time constant.
 *
 * The cache version ensures that new deploys invalidate old caches without
 * needing to commit generated IDs to the repository.
 */

import { NextResponse } from "next/server";

/**
 * Get the current build version for cache naming.
 * Uses Vercel commit SHA in production, falls back to a constant for dev.
 */
function getBuildVersion(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  // Fallback for local dev or non-Vercel deployments
  return "dev";
}

export async function GET() {
  const buildVersion = getBuildVersion();

  const script = `/**
 * Service worker for Abhyas PWA.
 *
 * Provides a basic offline experience: when the network is unavailable and
 * a navigation request fails, show /offline instead of the browser's
 * default "no internet" page.
 *
 * This is intentionally conservative:
 * - Only caches the offline page itself
 * - Does NOT cache authenticated API responses (Supabase, user data)
 * - Does NOT cache app pages (they depend on user state and database calls)
 * - Does NOT cache RSC payloads (they're tied to specific builds)
 * - Does NOT attempt to serve stale content
 *
 * White-label deployments can extend this with their own caching strategy,
 * but the baseline is safe: offline means offline, with a clear message.
 */

const CACHE_NAME = "abhyas-offline-${buildVersion}";
const OFFLINE_URL = "/offline";

// Install: cache the offline page and its dependencies
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Precache the offline page (rendered by Next.js with the root layout)
      // This includes the CSS and any inline assets
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
 * Only full-page navigations; never RSC, Supabase, /auth, or static assets.
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

  // Never intercept RSC requests (Next.js App Router server components).
  // These have the RSC: 1 header or _rsc query param and are tied to
  // specific builds. When they fail, Next.js falls back to a full navigation,
  // which then hits this handler and gets the offline page.
  const isRSC = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isRSC) {
    return false;
  }

  // Intercept full-page navigations
  if (request.mode === "navigate") {
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
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
