import { branding } from '@/lib/branding';
import { safeNextPath as safeNextPathImpl } from '@/lib/safe-next-path';

export { safeNextPathImpl as safeNextPath };

/**
 * Build a safe redirect origin for auth callbacks.
 * 
 * Trusts x-forwarded-proto and x-forwarded-host ONLY when:
 * 1. The request is NOT from localhost/127.x/::1, AND
 * 2. The forwarded host is the allowlisted brand host
 * 
 * For all other cases, returns the request URL's own protocol and host.
 * 
 * @param request - The incoming request
 * @returns A safe origin (protocol + host, no trailing slash)
 */
export function getRedirectOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  
  // Extract forwarded headers (Vercel sets these in production)
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  
  // If no forwarded headers, use the request's own origin (always safe)
  if (!forwardedHost) {
    return requestOrigin;
  }

  // Never trust forwarded headers when the request is from localhost/127.x/::1
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || 
      hostname.startsWith('127.') || 
      hostname === '::1' || 
      hostname === '[::1]') {
    return requestOrigin;
  }

  // Build allowlist: only the brand site host
  const brandSiteHost = new URL(branding.siteUrl).host;
  
  // ONLY trust x-forwarded headers when the forwarded host is the brand host
  // For all other forwarded hosts (including request's own host), use request origin
  if (forwardedHost !== brandSiteHost) {
    return requestOrigin;
  }

  // At this point, request is not from localhost AND forwarded host is the trusted brand host
  // If x-forwarded-proto has multiple values (comma-separated list), take the first
  let proto = forwardedProto;
  if (proto && proto.includes(',')) {
    proto = proto.split(',')[0].trim();
  }

  // Only accept 'http' or 'https' as protocol
  if (proto !== 'http' && proto !== 'https') {
    proto = requestUrl.protocol.replace(':', '');
  }
  
  return `${proto}://${forwardedHost}`;
}
