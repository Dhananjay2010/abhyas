/**
 * L1 fix: Validate the `next` redirect parameter to prevent open redirects.
 * 
 * Only allows same-origin relative paths: must start with exactly one `/`,
 * with no schemes, no protocol-relative URLs, no backslashes, no encoded
 * variants that could bypass checks, and no @ symbols that parse as user@host.
 */
export function sanitizeRedirectPath(next: string | null): string {
  if (!next || typeof next !== "string") return "/today";
  
  // Decode once to catch encoded bypasses like %2F%2F (which is //)
  // Don't decode repeatedly (to avoid double-encoding bypasses)
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    // Malformed encoding
    return "/today";
  }
  
  // Must start with exactly one forward slash (reject empty, //, backslash, scheme)
  if (!decoded.startsWith("/")) return "/today";
  if (decoded.startsWith("//")) return "/today";
  
  // Reject // anywhere in the string (catches /%09// and similar)
  if (decoded.includes("//")) return "/today";
  
  // Reject backslashes (Windows path separators, can bypass some parsers)
  if (decoded.includes("\\")) return "/today";
  
  // Reject @ symbols (e.g., /@evil.example or /path@evil.example)
  // new URL('https://app.com/@evil.example') parses host as 'evil.example'
  if (decoded.includes("@")) return "/today";
  
  // Reject schemes (http:, https:, javascript:, data:, etc.)
  // This catches /https://evil.example and encoded variants after decode
  if (decoded.includes(":")) return "/today";
  
  // Reject null bytes and other control characters that could cause issues
  if (/[\x00-\x1f]/.test(decoded)) return "/today";
  
  // Reject encoded slashes in the original (they can bypass startsWith checks)
  if (next.includes("%2F") || next.includes("%2f")) return "/today";
  if (next.includes("%5C") || next.includes("%5c")) return "/today"; // backslash
  
  return decoded;
}
