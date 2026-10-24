import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Fixed date for deterministic builds
const LAST_MODIFIED = new Date("2024-01-01T00:00:00Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  // Only list real public pages that exist
  return [
    {
      url: baseUrl,
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];
}
