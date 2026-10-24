import { branding } from '@/lib/branding';
import { safeNextPath as safeNextPathImpl } from '@/lib/safe-next-path';

export { safeNextPathImpl as safeNextPath };

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
