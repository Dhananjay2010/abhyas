import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERF_ENABLED } from "@/lib/perf";
import { isPublicPath } from "./public-paths";
import { sanitizeRedirectPath } from "../auth/redirect";

/**
 * Copy cookies from one NextResponse to another.
 * 
 * Used when creating a new redirect response after Supabase's setAll has written
 * cookies (like refreshed auth tokens) onto a different response object.
 */
function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach(({ name, value }) => {
    const cookie = from.cookies.get(name);
    if (cookie) {
      // Copy the cookie with all its options (path, maxAge, etc.)
      to.cookies.set(name, value, {
        path: cookie.path,
        domain: cookie.domain,
        maxAge: cookie.maxAge,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      });
    }
  });
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

  if (!signedIn && !isPublicPath(pathname)) {
    // Preserve the original destination (path + search) as a sanitized `next` param
    const origin = request.nextUrl.origin;
    const destination = pathname + request.nextUrl.search;
    const next = sanitizeRedirectPath(destination, origin);
    
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?next=${encodeURIComponent(next)}`;
    
    const redirect = NextResponse.redirect(url);
    // Copy any cookies that Supabase set (e.g., cleared expired tokens) onto the redirect
    copyCookies(response, redirect);
    return finish(redirect, started, pathname, signedIn);
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
