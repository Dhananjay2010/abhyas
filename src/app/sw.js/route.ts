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
import { OFFLINE_SCREEN_HEADING, OFFLINE_SCREEN_BODY, OFFLINE_SCREEN_BUTTON_LABEL } from "@/lib/offline-copy";

/**
 * Get the current build version for cache naming.
 * Uses Vercel commit SHA in production, falls back to build-time constant.
 * NEXT_PUBLIC_BUILD_ID is set once at build time in next.config.ts.
 */
function getBuildVersion(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
}

export async function GET() {
  const buildVersion = getBuildVersion();
  const brandId = branding.id;
  const iconUrl = branding.icons.icon192;

  const script = `/**
 * Service worker for ${branding.name} PWA.
 *
 * Provides a basic offline experience: when the network is unavailable and
 * a navigation request fails, show /offline instead of the browser's
 * default "no internet" page.
 *
 * This is intentionally conservative:
 * - Caches the offline page itself and its app icon
 * - Caches /_next/static/* (JS chunks, CSS) cache-first (immutable hashed filenames)
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
const ICON_URL = "${iconUrl}";

// Install: cache the offline page and app icon
// The offline page is rendered by Next.js at build time and uses shared constants
// for heading ("${OFFLINE_SCREEN_HEADING}"), body ("${OFFLINE_SCREEN_BODY}"),
// and button label ("${OFFLINE_SCREEN_BUTTON_LABEL}") to ensure consistency
// with in-app offline error boundaries.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Precache the offline page (rendered by Next.js with inline styles)
      // and the app icon it displays (so it shows offline)
      await cache.addAll([
        new Request(OFFLINE_URL, { cache: "reload" }),
        new Request(ICON_URL, { cache: "reload" }),
      ]);

      // Best-effort precache of the offline page's JS chunks
      // Read the cached /offline HTML and extract /_next/static/* URLs
      try {
        const offlineResponse = await cache.match(OFFLINE_URL);
        if (offlineResponse) {
          const offlineHtml = await offlineResponse.text();
          const chunkUrls = [];

          // Extract <script src="/_next/static/...">
          const scriptRegex = /<script[^>]+src="(\\/_next\\/static\\/[^"]+)"/g;
          let match;
          while ((match = scriptRegex.exec(offlineHtml)) !== null) {
            chunkUrls.push(match[1]);
          }

          // Extract <link href="/_next/static/..." rel="stylesheet">
          const linkRegex = /<link[^>]+href="(\\/_next\\/static\\/[^"]+)"[^>]*rel="stylesheet"/g;
          while ((match = linkRegex.exec(offlineHtml)) !== null) {
            chunkUrls.push(match[1]);
          }

          // Extract <link rel="stylesheet" href="/_next/static/...">
          const linkRegex2 = /<link[^>]+rel="stylesheet"[^>]+href="(\\/_next\\/static\\/[^"]+)"/g;
          while ((match = linkRegex2.exec(offlineHtml)) !== null) {
            chunkUrls.push(match[1]);
          }

          // Deduplicate and cache same-origin chunks
          const uniqueUrls = [...new Set(chunkUrls)];
          const sameOriginUrls = uniqueUrls.filter(url => url.startsWith('/_next/static/'));
          
          if (sameOriginUrls.length > 0) {
            // Best effort: cache all chunks together, but don't fail install if one fails
            try {
              await cache.addAll(sameOriginUrls.map(url => new Request(url, { cache: "reload" })));
            } catch {
              // One or more chunks failed to load, but continue with install
              // Runtime caching will pick them up on first navigation
            }
          }
        }
      } catch {
        // Failed to read offline HTML or extract chunks, but continue with install
        // Runtime caching will pick up chunks on first navigation
      }

      await self.skipWaiting();
    })()
  );
});

// Activate: clean up old caches for this brand only
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const brandPrefix = "${brandId}-offline-";
      await Promise.all(
        cacheNames.map((cacheName) => {
          // Only delete caches with this brand's prefix that aren't the current one
          if (cacheName.startsWith(brandPrefix) && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Check if a request is for a static asset that should be cached.
 * 
 * Cache /_next/static/* (JS chunks, CSS, etc.) - these have hashed filenames
 * and are immutable, so they're safe to cache indefinitely.
 */
function shouldCacheStatic(request) {
  // Only cache same-origin GET requests
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  
  // Only cache same-origin requests
  if (url.origin !== self.location.origin) {
    return false;
  }

  // Cache /_next/static/* (JS chunks, CSS, fonts, etc.)
  if (url.pathname.startsWith("/_next/static/")) {
    return true;
  }

  return false;
}

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

// Fetch: serve the offline page when a GET navigation request fails,
// serve precached icons cache-first, and cache /_next/static/* assets
self.addEventListener("fetch", (event) => {
  // Ignore all non-GET requests entirely (no respondWith).
  // POSTs and server actions go straight to the network and fail visibly.
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  // Serve precached icon cache-first (for offline page logo)
  if (url.pathname === new URL(ICON_URL, self.location.origin).pathname) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Not in cache, try network
        try {
          const networkResponse = await fetch(event.request);
          // Optionally cache it for next time
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Both cache and network failed
          return new Response("Icon not available", { status: 404 });
        }
      })()
    );
    return;
  }

  // Cache /_next/static/* assets (JS chunks, CSS) cache-first
  if (shouldCacheStatic(event.request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Not in cache, fetch from network and cache for next time
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            // Clone the response before caching (response can only be read once)
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Network failed and not in cache
          return new Response("Asset not available", { status: 404 });
        }
      })()
    );
    return;
  }

  // Check if this GET request should be intercepted for offline fallback
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
        
        if (cachedResponse) {
          // Return offline page with the correct URL in the address bar.
          // The SW serves this under the original request URL, so the page
          // can detect it with window.location and reload on retry.
          return new Response(cachedResponse.body, {
            status: cachedResponse.status,
            statusText: cachedResponse.statusText,
            headers: cachedResponse.headers,
          });
        }
        
        return new Response("Offline", { status: 503 });
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
