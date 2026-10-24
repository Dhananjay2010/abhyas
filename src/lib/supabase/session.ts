import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PERF_ENABLED } from "@/lib/perf";
import { isPublicPath } from "./public-paths";
import { branding } from "@/lib/branding";

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

/**
 * Generate a minimal 404 HTML page for proxy responses.
 * Uses current branding colors and app name.
 */
function generate404Html(): string {
  // Read-only access to branding (don't edit branding.ts per PR #8)
  const appName = escapeHtml(branding.name);
  const bgColor = branding.backgroundColor;
  
  // Brand accent color (reviewer confirmed #22c55e green)
  const accentColor = "#22c55e";
  
  // Compute text color for contrast on accent background
  // Dark text on green accent provides good contrast
  const linkTextColor = "#0a0c0e";
  
  // Text color for body (light on dark background)
  const bodyTextColor = "#f8f8f2";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - ${appName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${bgColor};
      color: ${bodyTextColor};
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    main {
      text-align: center;
      max-width: 28rem;
    }
    h1 {
      font-size: 4rem;
      font-weight: bold;
      letter-spacing: -0.025em;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 1rem;
    }
    p {
      margin-top: 0.5rem;
      opacity: 0.7;
    }
    a {
      display: inline-block;
      margin-top: 2rem;
      padding: 0.75rem 1.5rem;
      background: ${accentColor};
      color: ${linkTextColor};
      text-decoration: none;
      border-radius: 0.75rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    a:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <main>
    <h1>404</h1>
    <h2>Page not found</h2>
    <p>The page you're looking for doesn't exist or has been moved.</p>
    <a href="/">Go to ${appName}</a>
  </main>
</body>
</html>`;
}

/**
 * HTML-escape a string for safe insertion into HTML content.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    return finish(
      new NextResponse(generate404Html(), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
      started,
      pathname,
      signedIn
    );
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
