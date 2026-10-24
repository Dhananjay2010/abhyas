/**
 * Sanitize the `next` redirect parameter to prevent open redirects.
 *
 * Only allows same-origin relative paths: must start with exactly one `/`,
 * with no protocol-relative URLs (//) or backslashes (\), including when
 * percent-encoded.
 *
 * Allows legitimate query strings with + and %20 and encoded values like ?date=2026%2F10.
 * Control characters are rejected everywhere.
 *
 * Uses URL parsing to verify the result stays on the same origin.
 */
export function sanitizeRedirectPath(
  next: string | null,
  origin: string,
): string {
  if (!next || typeof next !== "string") return "/today";

  // Split into path and query parts
  const questionMarkIndex = next.indexOf("?");
  const pathPart = questionMarkIndex === -1 ? next : next.substring(0, questionMarkIndex);
  const queryPart = questionMarkIndex === -1 ? "" : next.substring(questionMarkIndex);

  // Decode the path to catch encoded bypasses like %2F%2F (which is //)
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathPart);
  } catch {
    // Malformed encoding in path
    return "/today";
  }

  // Must start with exactly one forward slash
  if (!decodedPath.startsWith("/")) return "/today";
  if (decodedPath.startsWith("//")) return "/today";
  if (decodedPath.startsWith("/\\")) return "/today";

  // Reject backslashes anywhere in path
  if (decodedPath.includes("\\")) return "/today";

  // Reject // anywhere in the decoded path
  if (decodedPath.includes("//")) return "/today";

  // Reject @ anywhere in path (can parse as user@host)
  if (decodedPath.includes("@")) return "/today";

  // Reject paths starting with /. to prevent domain suffix attacks
  if (decodedPath.startsWith("/.")) return "/today";

  // Reject control characters (0x00-0x1F, 0x7F) and whitespace in decoded path
  if (/[\x00-\x1F\x7F\s]/.test(decodedPath)) return "/today";

  // Reject encoded slashes, backslashes, and @ in the original path (before decode)
  if (pathPart.includes("%2F") || pathPart.includes("%2f")) return "/today";
  if (pathPart.includes("%5C") || pathPart.includes("%5c")) return "/today";
  if (pathPart.includes("%40")) return "/today";
  
  // Reject encoded control chars in path: %00-%1F, %7F
  // Allow %20 and + in query part, but not in path
  if (/%0[0-9a-fA-F]/.test(pathPart) || /%1[0-9a-fA-F]/.test(pathPart) || /%7[fF]/.test(pathPart)) return "/today";
  if (pathPart.includes("%20") || pathPart.includes("+")) return "/today";

  // For query part: only reject encoded control characters, allow + and %20 and other encoded values
  if (queryPart) {
    // Reject encoded control chars in query: %00-%1F, %7F
    if (/%0[0-9a-fA-F]/.test(queryPart) || /%1[0-9a-fA-F]/.test(queryPart) || /%7[fF]/.test(queryPart)) return "/today";
    
    // Try to decode query to check for control characters
    try {
      const decodedQuery = decodeURIComponent(queryPart);
      // Reject control characters in decoded query
      if (/[\x00-\x1F\x7F]/.test(decodedQuery)) return "/today";
      // Reject //, \, @ in decoded query
      if (decodedQuery.includes("//") || decodedQuery.includes("\\") || decodedQuery.includes("@")) return "/today";
    } catch {
      // Malformed encoding in query
      return "/today";
    }
  }

  // Build the URL and verify it stays on the same origin
  const reconstructed = decodedPath + queryPart;
  try {
    const url = new URL(reconstructed, origin);
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
