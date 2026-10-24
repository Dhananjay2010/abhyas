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
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  
  // If no forwarded headers, use the request's own origin (always safe)
  if (!forwardedHost) {
    return requestOrigin;
  }
  
  // Build the forwarded origin
  const proto = forwardedProto || requestUrl.protocol.replace(':', '');
  const forwardedOrigin = `${proto}://${forwardedHost}`;
  
  // Allowlist: request's own host + brand site URL host
  const allowedHosts = new Set([
    requestUrl.host,
    'abhyas-indol.vercel.app', // Production site
  ]);
  
  // Check if the forwarded host is in the allowlist
  if (allowedHosts.has(forwardedHost)) {
    return forwardedOrigin;
  }
  
  // If the forwarded host is not allowed, fall back to the request's own origin
  // (prevents open redirects via spoofed x-forwarded-host)
  return requestOrigin;
}
