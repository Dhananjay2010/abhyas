/**
 * Public path matching logic for the session proxy.
 *
 * Routes in PUBLIC_PATHS are reachable without a session. Everything else
 * redirects to "/".
 */

/** Routes reachable without a session. Everything else redirects to "/". */
export const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/legal",
  "/privacy",
  "/terms",
  "/sw.js",
  "/offline",
  "/robots.txt",
  "/sitemap.xml",
  "/api/version",
  "/api/in-progress",
];

/** Dev-only harnesses, never routable in production (the pages 404 there too). */
export const DEV_PATHS = process.env.NODE_ENV === "development" ? ["/dev"] : [];

/**
 * The latency probe, when one is configured.
 *
 * It has to be reachable without a session to be useful — it measures the path
 * between the proxy and Supabase, which has nothing to do with any user —
 * and it gates itself on PERF_TOKEN. With no token configured the route does
 * not exist, so this list is empty and the proxy behaves exactly as before.
 */
export const PROBE_PATHS = process.env.PERF_TOKEN ? ["/api/diag"] : [];

/**
 * Check if a pathname is public (accessible without authentication).
 *
 * Matches exact paths and subpaths with a "/" separator to prevent
 * accidental exposure of similar paths like /privacyfoo or /termsXYZ.
 * Special-cases "/" to match only exactly (not "//anything").
 */
export function isPublicPath(pathname: string): boolean {
  return [...PUBLIC_PATHS, ...DEV_PATHS, ...PROBE_PATHS].some((p) => {
    if (p === "/") {
      return pathname === "/";
    }
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}
