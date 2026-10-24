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
 * Only full-page navigation requests are intercepted. RSC requests
 * (Next.js App Router server components) are never intercepted; when they
 * fail, Next.js falls back to a full navigation, which then hits this
 * handler and gets the offline page.
 *
 * API calls, assets, and Supabase requests are never cached or intercepted.
 */
export function shouldInterceptForOffline(request: {
  url: string;
  mode: RequestMode;
  destination: RequestDestination;
  headers?: Record<string, string>;
  hasRscQuery?: boolean;
}): boolean {
  const url = new URL(request.url);

  // Never intercept Supabase API calls (they're authenticated and real-time)
  if (url.hostname.includes("supabase.co")) {
    return false;
  }

  // Never intercept /auth callbacks (OAuth state, session management)
  if (url.pathname.startsWith("/auth")) {
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

  // Intercept full-page navigations (mode === "navigate")
  if (request.mode === "navigate") {
    return true;
  }

  // Everything else (CSS, JS, images, fonts, API routes) is skipped.
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
 * This ensures old caches are cleaned up when a new version deploys.
 */
export function getCacheName(buildId?: string): string {
  const version = buildId || "v1";
  return `abhyas-offline-${version}`;
}
