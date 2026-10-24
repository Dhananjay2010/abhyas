/**
 * Site URL resolution for SEO metadata (sitemap, robots, og:url).
 *
 * Resolves the canonical site URL from branding config or environment variables,
 * with a fallback chain to ensure metadata routes never crash.
 */

import { branding } from "@/lib/branding";

/**
 * Get the canonical site URL for this deployment.
 *
 * Priority order:
 * 1. branding.siteUrl (validated at build time, primary source)
 * 2. NEXT_PUBLIC_SITE_URL environment variable (explicit override)
 * 3. VERCEL_PROJECT_PRODUCTION_URL (Vercel production domain)
 * 4. VERCEL_URL (Vercel preview/branch deployments)
 *
 * Returns the URL without a trailing slash, or an empty string if nothing resolves
 * (caller should handle empty string, e.g. by making the route dynamic and using
 * request headers).
 */
export function getSiteUrl(): string {
  // Priority 1: branding.siteUrl (always available in normal builds)
  try {
    if (branding?.siteUrl) {
      return stripTrailingSlash(branding.siteUrl);
    }
  } catch (error) {
    console.error("Failed to access branding.siteUrl:", error);
  }

  // Priority 2: NEXT_PUBLIC_SITE_URL (explicit override)
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envSiteUrl) {
    try {
      new URL(envSiteUrl); // Validate format
      return stripTrailingSlash(envSiteUrl);
    } catch {
      console.error(`Invalid NEXT_PUBLIC_SITE_URL: ${envSiteUrl}`);
    }
  }

  // Priority 3: VERCEL_PROJECT_PRODUCTION_URL (Vercel production)
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionUrl) {
    return stripTrailingSlash(`https://${vercelProductionUrl}`);
  }

  // Priority 4: VERCEL_URL (Vercel preview/branch)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return stripTrailingSlash(`https://${vercelUrl}`);
  }

  // No URL resolved: return empty string (caller decides how to handle)
  return "";
}

/**
 * Strip trailing slash from a URL string.
 * Returns the URL without a trailing slash, or the original if it has no slash.
 */
function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
