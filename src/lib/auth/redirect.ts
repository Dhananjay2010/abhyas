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

  // Reject backslashes anywhere (catches /\ and encoded variants after decode)
  if (decoded.includes("\\")) return "/today";

  // Reject // anywhere in the decoded string
  if (decoded.includes("//")) return "/today";

  // Reject @ anywhere (can parse as user@host in some contexts)
  if (decoded.includes("@")) return "/today";

  // Reject paths starting with /. to prevent domain suffix attacks
  // (/.evil.example could be misinterpreted in some contexts)
  if (decoded.startsWith("/.")) return "/today";

  // Reject encoded slashes, backslashes, and @ in the original (before decode)
  if (next.includes("%2F") || next.includes("%2f")) return "/today";
  if (next.includes("%5C") || next.includes("%5c")) return "/today";
  if (next.includes("%40")) return "/today";

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
