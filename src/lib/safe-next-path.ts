/**
 * Validate a `next` parameter for safe same-origin redirects.
 * 
 * Accepts only relative paths starting with a single '/', not '//' and not '/\\'.
 * Rejects paths with backslashes, control characters, and URLs that resolve to
 * a different origin.
 * 
 * @param next - The next path from query params
 * @param fallback - The fallback path if validation fails (defaults to '/today')
 * @returns The validated path, or the fallback if invalid
 */
export function safeNextPath(next: string | null | undefined, fallback = '/today'): string {
  if (!next || typeof next !== 'string') {
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

  // Reject URL-encoded slashes that could bypass the '//' check (case-insensitive)
  if (lowerNext.includes('%2f%2f')) {
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
