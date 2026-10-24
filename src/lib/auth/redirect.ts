/**
 * Sanitize the `next` redirect parameter to prevent open redirects.
 *
 * Only allows same-origin relative paths: must start with exactly one `/`,
 * with no protocol-relative URLs (//) or backslashes (\), including when
 * percent-encoded.
 *
 * Uses URL parsing to verify the result stays on the same origin.
 */
export function sanitizeRedirectPath(
  next: string | null,
  origin: string,
): string {
  if (!next || typeof next !== "string") return "/today";

  // Decode once to catch encoded bypasses like %2F%2F (which is //)
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    // Malformed encoding
    return "/today";
  }

  // Must start with exactly one forward slash
  if (!decoded.startsWith("/")) return "/today";
  if (decoded.startsWith("//")) return "/today";
  if (decoded.startsWith("/\\")) return "/today";

  // Reject backslashes anywhere (catches /\ and encoded variants after decode)
  if (decoded.includes("\\")) return "/today";

  // Reject // anywhere in the decoded string
  if (decoded.includes("//")) return "/today";

  // Reject @ anywhere (can parse as user@host in some contexts)
  if (decoded.includes("@")) return "/today";

  // Reject paths starting with /. to prevent domain suffix attacks
  // (/.evil.example could be misinterpreted in some contexts)
  if (decoded.startsWith("/.")) return "/today";

  // Reject control characters (0x00-0x1F, 0x7F) and whitespace
  // These can be used to bypass filters or cause parsing issues
  if (/[\x00-\x1F\x7F\s]/.test(decoded)) return "/today";

  // Reject encoded slashes, backslashes, @, control chars, and whitespace in the original (before decode)
  if (next.includes("%2F") || next.includes("%2f")) return "/today";
  if (next.includes("%5C") || next.includes("%5c")) return "/today";
  if (next.includes("%40")) return "/today";
  // Common control char encodings: %09 (tab), %0a/%0A (LF), %0d/%0D (CR), %20 (space)
  if (/%0[0-9a-fA-F]/.test(next) || /%1[0-9a-fA-F]/.test(next) || /%7[fF]/.test(next)) return "/today";
  if (next.includes("%20") || next.includes("+")) return "/today";

  // Build the URL and verify it stays on the same origin
  try {
    const url = new URL(decoded, origin);
    if (url.origin !== origin) return "/today";
    // Return the pathname + search + hash (everything after the origin)
    return url.pathname + url.search + url.hash;
  } catch {
    // Invalid URL construction
    return "/today";
  }
}

/**
 * Build a sanitized redirect query string for an unauthenticated user.
 *
 * Captures the original destination (pathname + search) and returns it as
 * a query string parameter that can be appended to the landing page URL.
 */
export function buildRedirectQuery(
  pathname: string,
  search: string,
  origin: string,
): string {
  const destination = pathname + search;
  const next = sanitizeRedirectPath(destination, origin);
  return `?next=${encodeURIComponent(next)}`;
}

/**
 * Copy cookies from one NextResponse to another.
 *
 * Used when creating a new redirect response after Supabase's setAll has written
 * cookies (like refreshed auth tokens) onto a different response object.
 */
export function copyCookies(
  from: { cookies: { getAll(): Array<{ name: string; value: string }>; get(name: string): { name: string; value: string; path?: string; domain?: string; maxAge?: number; expires?: Date | number; httpOnly?: boolean; secure?: boolean; sameSite?: "strict" | "lax" | "none" | boolean } | undefined } },
  to: { cookies: { set(name: string, value: string, options?: { path?: string; domain?: string; maxAge?: number; expires?: Date | number; httpOnly?: boolean; secure?: boolean; sameSite?: "strict" | "lax" | "none" | boolean }): void } },
): void {
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
