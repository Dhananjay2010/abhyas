import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/terms", "/privacy"],
        disallow: [
          "/today",
          "/breathe",
          "/history",
          "/progress",
          "/settings",
          "/onboarding",
          "/session",
          "/yoga",
          "/auth",
          "/api",
          "/dev",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
