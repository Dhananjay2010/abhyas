import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

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
