import type { MetadataRoute } from "next";
import { branding } from "@/lib/branding";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = branding.siteUrl;

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
