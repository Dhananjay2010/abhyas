import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Middleware matcher pattern: matches paths that should go through middleware
// Uses negative lookahead to exclude static assets and specific files
// Must start with ^ to match from beginning of string only
// Image extensions use .*\. to match at any depth (e.g. /brands/gym/logo.svg)
// screenshots/ excluded for PWA manifest (PR #8)
// Use (?:/|$) after path prefixes to match them as directory boundaries
// Use exact $ anchors for SEO files (robots.txt, sitemap.xml) so /sitemap.xml/foo goes through middleware
export const MIDDLEWARE_MATCHER = "^/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|manifest\\.webmanifest$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|icons/|screenshots/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)$";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|manifest\\.webmanifest$|sw\\.js$|robots\\.txt$|sitemap\\.xml$|icons/|screenshots/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)$",
  ],
};
