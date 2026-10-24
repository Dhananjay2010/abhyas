import { branding } from '@/lib/branding';
import { safeNextPath as safeNextPathImpl } from '@/lib/safe-next-path';

<<<<<<< HEAD
/**
 * Validate a `next` parameter for safe same-origin redirects.
 * 
 * Accepts only relative paths starting with a single '/', not '//' and not '/\\'.
 * Rejects paths with backslashes, control characters, paths longer than 512 characters,
 * and URLs that resolve to a different origin.
 * 
 * @param next - The next path from query params
 * @returns The validated path, or '/today' if invalid
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') {
    return '/today';
  }

  // Reject paths longer than 512 characters to avoid oversized headers
  if (next.length > 512) {
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
=======
export { safeNextPathImpl as safeNextPath };
>>>>>>> origin/main

/**
 * Build a safe redirect origin for auth callbacks.
 * 
 * Trusts x-forwarded-proto and x-forwarded-host when the forwarded host
 * is an allowlisted brand host. For localhost requests, never trusts
 * forwarded headers to prevent local dev from being tricked by spoofed headers.
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

  // Never trust forwarded headers for localhost (prevents local spoofing)
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname.startsWith('127.')) {
    return requestOrigin;
  }

  // Build allowlist of forwarded hosts we trust
  const brandSiteHost = new URL(branding.siteUrl).host;
  const allowedForwardedHosts = new Set([
    brandSiteHost,        // The configured brand host
    requestUrl.host,      // The request's own host (always safe)
  ]);
  
  // Only trust forwarded host if it's in the allowlist
  if (!allowedForwardedHosts.has(forwardedHost)) {
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
  
  return `${proto}://${forwardedHost}`;
}
