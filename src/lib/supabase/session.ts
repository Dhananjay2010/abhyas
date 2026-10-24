import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERF_ENABLED } from "@/lib/perf";
import { isPublicPath } from "./public-paths";

/**
 * Known protected route prefixes that require authentication.
 * Signed-out users accessing these are redirected to /.
 * /api is included to preserve its pre-existing signed-out behavior.
 */
export const PROTECTED_PREFIXES = [
  "/today",
  "/breathe",
  "/history",
  "/progress",
  "/settings",
  "/onboarding",
  "/session",
  "/yoga",
  "/api",
];

export type RouteDecision =
  | { kind: "pass" }
  | { kind: "redirect"; to: URL }
  | { kind: "notFound" };

/**
 * Build the redirect URL for signed-out users accessing protected routes.
 * Returns a URL object with pathname '/'.
 * 
 * Dev 1 will extend this to append a sanitized `next` param for return-after-login.
 */
export function signedOutRedirectUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return url;
}

/**
 * Decide what to do with a request based on authentication and route.
 * 
 * - Signed in: always { kind: 'pass' }
 * - Public path: { kind: 'pass' }
 * - Protected route: { kind: 'redirect', to: URL }
 * - Unknown path: { kind: 'notFound' }
 */
export function routeDecision(
  pathname: string,
  signedIn: boolean,
  request: NextRequest
): RouteDecision {
  if (signedIn || isPublicPath(pathname)) {
    return { kind: "pass" };
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  return isProtected
    ? { kind: "redirect", to: signedOutRedirectUrl(request) }
    : { kind: "notFound" };
}

export async function updateSession(request: NextRequest) {
  const started = performance.now();
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: reading the session here is what refreshes an expiring auth
  // token and writes the rotated cookies onto the response.
  //
  // This used to be `getUser()`, which is an HTTP call to Supabase's auth
  // service on *every* request through the proxy — paid before the page had
  // even started. `getClaims()` verifies the same token's signature locally
  // against the project's ES256 JWKS (fetched once per warm instance), still
  // goes through `getSession()` so refresh behaviour is unchanged, and falls
  // back to `getUser()` on its own if a token cannot be verified locally.
  const {
    data: claims,
    error,
  } = await supabase.auth.getClaims();
  const signedIn = !error && Boolean(claims?.claims?.sub);

  const decision = routeDecision(pathname, signedIn, request);

  if (decision.kind === "redirect") {
    return finish(
      NextResponse.redirect(decision.to),
      started,
      pathname,
      signedIn
    );
  }

  if (decision.kind === "notFound") {
    // Let Next.js render app/not-found.tsx with proper layout and status 404
    return finish(response, started, pathname, signedIn);
  }

  return finish(response, started, pathname, signedIn);
}

/**
 * Stamp the proxy's own cost onto the response, on every path out — including
 * the redirect, which is the one an unauthenticated request takes.
 */
function finish(
  response: NextResponse,
  started: number,
  pathname: string,
  signedIn: boolean,
): NextResponse {
  if (!PERF_ENABLED) return response;
  const ms = performance.now() - started;
  response.headers.set("Server-Timing", `proxy;dur=${ms.toFixed(1)}`);
  console.log(`[perf] proxy ${pathname} ${ms.toFixed(0)}ms signedIn=${signedIn}`);
  return response;
}
