import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Middleware matcher pattern: matches paths that should go through middleware
// Uses negative lookahead to exclude static assets and specific files
// Image extensions use .*\. to match at any depth (e.g. /brands/gym/logo.svg)
// screenshots/ excluded for PWA manifest (PR #8)
// Use (?:/|$) after path prefixes to match them as directory boundaries
// Use exact $ anchors for SEO files (robots.txt, sitemap.xml) so /sitemap.xml/foo goes through middleware
// Note: Next.js compiles the matcher itself; outer anchors (^ and $) are not supported
export const MIDDLEWARE_MATCHER = "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|manifest\\.webmanifest$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|icons/|screenshots/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)";

async function proxyImpl(request: NextRequest) {
  const isServerAction = request.headers.has("Next-Action");
  const result = await updateSession(request);
  
  // Server actions with expired sessions: return 401 text instead of 307 redirect.
  // Next.js 16's action client (fetchServerAction in server-action-reducer.js)
  // cannot parse JSON from non-RSC responses. For status >= 400 with
  // content-type text/plain, it throws an Error with the response text as the
  // message. For other content-types, it throws "An unexpected response was
  // received from the server." We use text/plain with a detectable prefix
  // so isSessionExpired can reliably identify it.
  if (isServerAction && result.status >= 307 && result.status <= 308) {
    const location = result.headers.get("location");
    if (location === "/" || location?.startsWith("/?next=")) {
      return new NextResponse("SESSION_EXPIRED: Your session has expired", {
        status: 401,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
  }
  
  return result;
}

export default proxyImpl;
export { proxyImpl as proxy };

export const config = {
  matcher: [
    "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|manifest\\.webmanifest$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|icons/|screenshots/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
