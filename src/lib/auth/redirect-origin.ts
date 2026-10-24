import { branding } from '@/lib/branding';
import { safeNextPath as safeNextPathImpl } from '@/lib/safe-next-path';

export { safeNextPathImpl as safeNextPath };

/**
 * Build a safe redirect origin for auth callbacks.
 * 
 * Default behavior (TRUST_PROXY not set or not "1"):
 * - Trusts x-forwarded-proto and x-forwarded-host ONLY when:
 *   1. The request is NOT from localhost/127.x/::1, AND
 *   2. The forwarded host is the allowlisted brand host
 * - For all other cases, returns the request URL's own protocol and host.
 * 
 * With TRUST_PROXY=1 (opt-in for self-hosted deployments behind a proxy):
 * - Trusts x-forwarded-host ONLY if it equals the brand host (branding.siteUrl host)
 * - Trusts x-forwarded-proto as http or https
 * - Does NOT check if request is from localhost (trusts the proxy headers)
 * 
 * @param request - The incoming request
 * @returns A safe origin (protocol + host, no trailing slash)
 */
export function getRedirectOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  
  // Extract forwarded headers (Vercel/proxy sets these in production)
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  
  // If no forwarded headers, use the request's own origin (always safe)
  if (!forwardedHost) {
    return requestOrigin;
  }

  const trustProxy = process.env.TRUST_PROXY === '1';

  // Default behavior: never trust forwarded headers when the request is from localhost/127.x/::1
  // With TRUST_PROXY=1: skip this check (trust the proxy)
  if (!trustProxy) {
    const hostname = requestUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || 
        hostname.startsWith('127.') || 
        hostname === '::1' || 
        hostname === '[::1]') {
      return requestOrigin;
    }
  }

  // Build allowlist: only the brand site host
  const brandSiteUrl = new URL(branding.siteUrl);
  const brandSiteHost = brandSiteUrl.hostname; // hostname without port
  const brandSitePort = brandSiteUrl.port || (brandSiteUrl.protocol === "https:" ? "443" : "80");
  
  // Parse forwarded host (may include port)
  const forwardedUrl = new URL(`http://${forwardedHost}`);
  const forwardedHostname = forwardedUrl.hostname;
  const forwardedPort = forwardedUrl.port || "80"; // x-forwarded-host doesn't have protocol, assume 80 if no port
  
  // ONLY trust x-forwarded headers when the forwarded hostname matches the brand hostname (case-insensitive)
  // Port mismatch is tolerated: default port (80/443) vs explicit port, or http vs https default.
  // For all other forwarded hosts, use request origin
  if (forwardedHostname.toLowerCase() !== brandSiteHost.toLowerCase()) {
    return requestOrigin;
  }

  // At this point, forwarded host is the trusted brand host
  // (and either not localhost, or TRUST_PROXY=1)
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
