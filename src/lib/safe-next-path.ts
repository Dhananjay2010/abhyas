/**
 * Validate a `next` parameter for safe same-origin redirects.
 * 
 * Accepts only relative paths starting with a single '/', not '//' and not '/\\'.
 * Rejects paths with backslashes, control characters, paths longer than 512 characters,
 * and URLs that resolve to a different origin.
 * 
 * URL-encoded slashes (%2F%2F, %2f%2f) and backslashes (%5C, %5c) are only checked in
 * the PATH part (before ? or #), not in query strings or fragments.
 * 
 * @param next - The next path from query params
 * @param fallback - The fallback path if validation fails (defaults to '/today')
 * @returns The validated path, or the fallback if invalid
 */
export function safeNextPath(next: string | null | undefined, fallback = '/today'): string {
  if (!next || typeof next !== 'string') {
    return fallback;
  }

  // Reject paths longer than 512 characters to avoid oversized headers
  if (next.length > 512) {
    return fallback;
  }

  // Must start with a single '/', not '//' (protocol-relative) or '/\' (Windows path)
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }

  // Reject backslashes and control characters
  if (next.includes('\\') || /[\x00-\x1F\x7F]/.test(next)) {
    return fallback;
  }

  // Reject javascript: and data: URIs (unlikely given the '/' check, but defense in depth)
  const lowerNext = next.toLowerCase().replace(/[\s\t\n\r]/g, '');
  if (lowerNext.startsWith('javascript:') || lowerNext.startsWith('data:')) {
    return fallback;
  }

  // Extract path part (before ? or #) to check for encoded slashes and backslashes
  const queryIndex = next.indexOf('?');
  const hashIndex = next.indexOf('#');
  let pathEnd = next.length;
  if (queryIndex !== -1) pathEnd = Math.min(pathEnd, queryIndex);
  if (hashIndex !== -1) pathEnd = Math.min(pathEnd, hashIndex);
  const pathPart = next.substring(0, pathEnd);

  // Reject URL-encoded double slashes and backslashes in PATH only (case-insensitive)
  const lowerPath = pathPart.toLowerCase();
  if (lowerPath.includes('%2f%2f') || lowerPath.includes('%5c')) {
    return fallback;
  }

  // Verify the path resolves to the same origin when parsed as a URL
  try {
    const resolved = new URL(next, 'http://x');
    if (resolved.origin !== 'http://x') {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return next;
}
