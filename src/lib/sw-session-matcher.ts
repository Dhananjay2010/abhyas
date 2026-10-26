/**
 * SW Session Route Matcher (extracted for testing)
 * 
 * Determines if a request should be cached for offline session reload.
 */

export interface SessionRouteRequest {
  method: string;
  url: string;
  mode: string;
  headers: {
    get(name: string): string | null;
  };
}

export interface SessionRouteContext {
  origin: string;
}

export function isSessionRoute(
  request: SessionRouteRequest,
  ctx: SessionRouteContext
): boolean {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  // Only cache same-origin requests
  if (url.origin !== ctx.origin) {
    return false;
  }

  // Cache /session/[id] routes (but not RSC requests)
  const isRSC = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (url.pathname.startsWith("/session/") && url.pathname.length > 9 && !isRSC && request.mode === "navigate") {
    return true;
  }

  return false;
}
