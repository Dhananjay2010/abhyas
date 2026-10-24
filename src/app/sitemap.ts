import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Use build-time constant if available (set during build via CI or local env),
// otherwise omit lastModified for deterministic builds without hardcoded dates
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME;
const LAST_MODIFIED = BUILD_TIME ? new Date(BUILD_TIME) : undefined;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  // Only list real public pages that exist
  return [
    {
      url: baseUrl,
      ...(LAST_MODIFIED && { lastModified: LAST_MODIFIED }),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${baseUrl}/terms`,
      ...(LAST_MODIFIED && { lastModified: LAST_MODIFIED }),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      ...(LAST_MODIFIED && { lastModified: LAST_MODIFIED }),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
