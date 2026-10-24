import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERF_ENABLED } from "@/lib/perf";

/** Routes reachable without a session. Everything else redirects to "/". */
const PUBLIC_PATHS = ["/", "/auth", "/legal", "/terms", "/privacy"];

/** Dev-only harnesses, never routable in production (the pages 404 there too). */
const DEV_PATHS = process.env.NODE_ENV === "development" ? ["/dev"] : [];

/**
 * The latency probe, when one is configured.
 *
 * It has to be reachable without a session to be useful — it measures the path
 * between this function and Supabase, which has nothing to do with any user —
 * and it gates itself on PERF_TOKEN. With no token configured the route does
 * not exist, so this list is empty and the proxy behaves exactly as before.
 */
const PROBE_PATHS = process.env.PERF_TOKEN ? ["/api/diag"] : [];

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

  const isPublic = [...PUBLIC_PATHS, ...DEV_PATHS, ...PROBE_PATHS].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Always let the request through to Next.js first. Pages that require
  // authentication will handle their own redirects. This ensures unknown
  // routes can properly 404 instead of redirecting to home.
  //
  // If not signed in and accessing a protected route, set a header so the
  // route can check and redirect if needed. But for now, let it through
  // so Next.js can determine if the route exists.
  if (!signedIn && !isPublic) {
    // For known protected routes, redirect as before
    const PROTECTED_PREFIXES = ["/today", "/breathe", "/history", "/progress", "/settings", "/onboarding", "/session", "/yoga"];
    const isKnownProtected = PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    
    if (isKnownProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return finish(NextResponse.redirect(url), started, pathname, signedIn);
    }
    // For unknown paths, let them through to Next.js for proper 404 handling
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
