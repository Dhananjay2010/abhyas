import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Check if a request is from the same origin (CSRF protection).
 *
 * Allows the request when:
 * - The Origin header matches the request URL's origin, OR
 * - The Sec-Fetch-Site header is "same-origin"
 *
 * When both headers are missing, the request is rejected. This is the secure
 * default: older browsers that don't send Sec-Fetch-Site will have an Origin
 * from a form POST, and legitimate same-origin requests from modern browsers
 * will have Sec-Fetch-Site.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");
  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;

  // Allow if Origin matches the request's own origin
  if (origin === requestOrigin) {
    return true;
  }

  // Allow if Sec-Fetch-Site indicates same-origin
  if (secFetchSite === "same-origin") {
    return true;
  }

  // Reject: cross-site origin or missing headers
  return false;
}

/**
 * POST-only sign-out route.
 *
 * This is kept for backwards compatibility with existing forms that POST here.
 * New code should prefer the signOutAction server action for better error
 * handling and loading states.
 *
 * Signs out only the current device (local scope).
 */
export async function POST(request: Request) {
  // CSRF protection: reject cross-origin requests
  if (!isSameOriginRequest(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    // If signOut fails, return a 500 response.
    // Forms that POST here won't see this error in the UI, but at least they
    // won't be redirected as if signed out.
    return new NextResponse(error.message, { status: 500 });
  }

  // After signOut completes and cookies are cleared, redirect.
  // The redirect must happen via Next.js's redirect() to ensure the cleared
  // cookies are included in the response.
  redirect("/");
}
