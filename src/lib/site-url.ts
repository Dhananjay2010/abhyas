/**
 * Get the site's base URL for robots.txt, sitemap.xml, and other absolute URLs.
 * 
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (set per deployment)
 * 2. VERCEL_PROJECT_PRODUCTION_URL (the production domain, not the preview hash)
 * 3. http://localhost:3000 (dev fallback)
 * 
 * TODO: Once PR #8 is merged, this should read from branding's domain getter
 * for white-label gym deployments.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  
  return "http://localhost:3000";
}
