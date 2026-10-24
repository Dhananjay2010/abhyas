import { branding } from '@/lib/branding';

/**
 * Validate a `next` parameter for safe same-origin redirects.
 * 
 * Accepts only relative paths starting with a single '/', not '//' and not '/\\'.
 * Rejects paths with backslashes, control characters, and URLs that resolve to
 * a different origin.
 * 
 * @param next - The next path from query params
 * @returns The validated path, or '/today' if invalid
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') {
    return '/today';
  }

  // Must start with a single '/', not '//' (protocol-relative) or '/\' (Windows path)
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/today';
  }

  // Reject backslashes and control characters
  if (next.includes('\\') || /[\x00-\x1F\x7F]/.test(next)) {
    return '/today';
  }

  // Reject javascript: and data: URIs (unlikely given the '/' check, but defense in depth)
  if (next.toLowerCase().startsWith('javascript:') || next.toLowerCase().startsWith('data:')) {
    return '/today';
  }

  // Verify the path resolves to the same origin when parsed as a URL
  try {
    const resolved = new URL(next, 'http://x');
    if (resolved.origin !== 'http://x') {
      return '/today';
    }
  } catch {
    // Malformed URL
    return '/today';
  }

  return next;
}

/**
 * Build a safe redirect origin for auth callbacks.
 * 
 * Uses x-forwarded-proto and x-forwarded-host when present (Vercel prod),
 * otherwise falls back to the request URL's protocol and host.
 * 
 * Validates the host against an allowlist to prevent open redirects:
 * - The request's own host (always safe)
 * - The brand site URL host (configured in branding)
 * 
 * @param request - The incoming request
 * @returns A safe origin (protocol + host, no trailing slash)
 */
export function getRedirectOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  
  // Extract forwarded headers (Vercel sets these in production)
  let forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  
  // If no forwarded headers, use the request's own origin (always safe)
  if (!forwardedHost) {
    return requestOrigin;
  }

  // If x-forwarded-proto has multiple values (comma-separated list), take the first
  if (forwardedProto && forwardedProto.includes(',')) {
    forwardedProto = forwardedProto.split(',')[0].trim();
  }

  // Only accept 'http' or 'https' as protocol
  const proto = (forwardedProto === 'http' || forwardedProto === 'https')
    ? forwardedProto
    : requestUrl.protocol.replace(':', '');
  
  const forwardedOrigin = `${proto}://${forwardedHost}`;
  
  // Allowlist: request's own host + brand site URL host
  const brandSiteHost = new URL(branding.siteUrl).host;
  const allowedHosts = new Set([
    requestUrl.host,
    brandSiteHost,
  ]);
  
  // Check if the forwarded host is in the allowlist
  if (allowedHosts.has(forwardedHost)) {
    return forwardedOrigin;
  }
  
  // If the forwarded host is not allowed, fall back to the request's own origin
  // (prevents open redirects via spoofed x-forwarded-host)
  return requestOrigin;
}
