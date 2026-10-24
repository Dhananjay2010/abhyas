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
 * Only navigation requests (full page loads and Next.js RSC requests)
 * are candidates for the offline fallback. API calls, assets, and
 * Supabase requests are never cached or intercepted.
 */
export function shouldInterceptForOffline(request: {
  url: string;
  mode: RequestMode;
  destination: RequestDestination;
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

  // Intercept full-page navigations (mode === "navigate")
  if (request.mode === "navigate") {
    return true;
  }

  // Intercept Next.js RSC data requests (/_next/data/...)
  // These are client-side route transitions that fetch server components.
  // Without this, navigating tabs while offline shows a blank screen.
  if (url.pathname.startsWith("/_next/data/")) {
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
