/**
 * Service worker decision logic, extracted for testing.
 *
 * These functions determine when to serve cached offline content vs.
 * attempting a network request. Exported so they can be tested in Node
 * without a ServiceWorker global.
 */

/**
 * Check if a request should be intercepted by the offline fallback.
 *
 * CRITICAL: Only GET requests for full-page navigation are intercepted.
 * All other requests (POST, PUT, DELETE, etc.) and server actions MUST
 * go straight to the network and fail visibly, so the client can handle
 * the error (Dev 3 is building a client outbox for this).
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
export function shouldInterceptForOffline(request: {
  url: string;
  method: string;
  mode: RequestMode;
  destination: RequestDestination;
  headers?: Record<string, string>;
  hasRscQuery?: boolean;
}): boolean {
  // NEVER intercept non-GET requests. POSTs and server actions must fail
  // visibly to the page, not return a cached offline fallback.
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  // Never intercept server actions (POST with Next-Action header).
  // Check this explicitly even though we already checked method !== "GET",
  // as a defense-in-depth measure.
  if (request.headers && request.headers["Next-Action"]) {
    return false;
  }

  // Never intercept Supabase API calls (they're authenticated and real-time)
  if (url.hostname.includes("supabase.co")) {
    return false;
  }

  // Never intercept /auth callbacks (OAuth state, session management)
  if (url.pathname.startsWith("/auth")) {
    return false;
  }

  // Never intercept /api routes (they're server-side data fetches)
  if (url.pathname.startsWith("/api")) {
    return false;
  }

  // Never intercept RSC requests (Next.js App Router server components).
  // These have the RSC: 1 header or _rsc query param and are tied to
  // specific builds. When they fail, Next.js falls back to a full navigation.
  const isRSC = 
    (request.headers && request.headers["RSC"] === "1") ||
    request.hasRscQuery ||
    url.searchParams.has("_rsc");
  if (isRSC) {
    return false;
  }

  // Intercept GET requests for full-page navigations (mode === "navigate")
  if (request.mode === "navigate") {
    return true;
  }

  // Everything else (CSS, JS, images, fonts) is skipped.
  // The service worker does not cache these; offline means offline.
  return false;
}

/**
 * Determine the cache name for this service worker version.
 *
 * In production, the build process injects a BUILD_ID (from Next.js)
 * or VERCEL_GIT_COMMIT_SHA (from Vercel). If neither is present,
 * fall back to a static version string.
 *
 * The cache name includes the brand ID (from branding.id) to ensure
 * different brands on the same origin never collide.
 *
 * This ensures old caches are cleaned up when a new version deploys.
 */
export function getCacheName(brandId: string, buildId?: string): string {
  const version = buildId || "v1";
  return `${brandId}-offline-${version}`;
}

/**
 * Determine which caches should be deleted during service worker activation.
 *
 * Only deletes caches that:
 * 1. Match the brand prefix (don't touch other brands' caches)
 * 2. Are NOT the current cache name
 *
 * @param allCacheNames - All cache names from caches.keys()
 * @param currentCacheName - The cache name for this SW version
 * @param brandPrefix - The brand-specific cache prefix (e.g. "abhyas-offline-")
 * @returns Array of cache names to delete
 */
export function cachesToDelete(
  allCacheNames: string[],
  currentCacheName: string,
  brandPrefix: string
): string[] {
  return allCacheNames.filter((cacheName) => {
    // Only consider caches with this brand's prefix
    if (!cacheName.startsWith(brandPrefix)) {
      return false;
    }
    // Don't delete the current cache
    if (cacheName === currentCacheName) {
      return false;
    }
    // Delete old caches for this brand
    return true;
  });
}

/**
 * ServiceWorkerRegistration interface for dependency injection in tests.
 */
export interface ServiceWorkerRegistrationLike {
  unregister(): Promise<boolean>;
  scope: string;
}

/**
 * ServiceWorkerContainer interface for dependency injection in tests.
 */
export interface ServiceWorkerContainerLike {
  register(scriptURL: string): Promise<ServiceWorkerRegistrationLike>;
  getRegistrations(): Promise<readonly ServiceWorkerRegistrationLike[]>;
}

/**
 * Sync service worker state based on environment.
 *
 * In production: registers /sw.js
 * In development: unregisters all existing service workers
 *
 * Pure function extracted from ServiceWorkerRegistration component for testability.
 *
 * @param env - Environment (process.env.NODE_ENV)
 * @param sw - ServiceWorkerContainer (navigator.serviceWorker)
 * @returns Promise that resolves when sync is complete
 */
export async function syncServiceWorker(
  env: string,
  sw: ServiceWorkerContainerLike
): Promise<void> {
  if (env === "production") {
    // Production: register the service worker
    await sw.register("/sw.js");
  } else {
    // Development: unregister all existing service workers
    const registrations = await sw.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }
}
