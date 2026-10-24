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

import { branding } from "@/lib/branding";

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

/**
 * Derive a brand ID from the brand name for cache naming.
 * This ensures that different brands on the same origin never collide.
 */
function getBrandId(): string {
  return branding.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export async function GET() {
  const buildVersion = getBuildVersion();
  const brandId = getBrandId();

  const script = `/**
 * Service worker for ${branding.name} PWA.
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

const CACHE_NAME = "${brandId}-offline-${buildVersion}";
const OFFLINE_URL = "/offline";

// Install: cache the offline page
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Precache the offline page (rendered by Next.js with inline styles)
      // The page has inline styles so it works without external CSS files
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
 *
 * CRITICAL: Only GET requests for full-page navigation are intercepted.
 * All other requests (POST, PUT, DELETE, etc.) and server actions MUST
 * go straight to the network and fail visibly.
 *
 * Never intercepted:
 * - Non-GET requests (POST, PUT, DELETE, etc.)
 * - Server actions (POST with Next-Action header)
 * - RSC requests (Next.js App Router server components)
 * - API routes (/api/*)
 * - Auth routes (/auth/*)
 * - Supabase API calls
 * - Static assets
 */
function shouldInterceptForOffline(request) {
  // NEVER intercept non-GET requests. POSTs and server actions must fail
  // visibly to the page, not return a cached offline fallback.
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  // Never intercept server actions (POST with Next-Action header).
  // Check this explicitly even though we already checked method !== "GET",
  // as a defense-in-depth measure.
  if (request.headers.get("Next-Action")) {
    return false;
  }

  // Never intercept Supabase API calls
  if (url.hostname.includes("supabase.co")) {
    return false;
  }

  // Never intercept /auth callbacks
  if (url.pathname.startsWith("/auth")) {
    return false;
  }

  // Never intercept /api routes
  if (url.pathname.startsWith("/api")) {
    return false;
  }

  // Never intercept RSC requests (Next.js App Router server components).
  // These have the RSC: 1 header or _rsc query param and are tied to
  // specific builds. When they fail, Next.js falls back to a full navigation.
  const isRSC = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isRSC) {
    return false;
  }

  // Intercept GET requests for full-page navigations
  if (request.mode === "navigate") {
    return true;
  }

  return false;
}

// Fetch: serve the offline page when a GET navigation request fails
self.addEventListener("fetch", (event) => {
  // Ignore all non-GET requests entirely (no respondWith).
  // POSTs and server actions go straight to the network and fail visibly.
  if (event.request.method !== "GET") {
    return;
  }

  // Check if this GET request should be intercepted
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
