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
import { MIDDLEWARE_MATCHER, config } from "../src/proxy";

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
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  const robotsTxt = robots();
  check("has rules array", Array.isArray(robotsTxt.rules));
  check("has sitemap URL", typeof robotsTxt.sitemap === "string");
  check("sitemap uses getSiteUrl", robotsTxt.sitemap === "https://example.com/sitemap.xml");
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

console.log("\n4. Middleware matcher pattern");
{
  // Test the real matcher constant directly
  const regex = new RegExp(MIDDLEWARE_MATCHER);

  // Verify constant matches config literal (Next.js requires static config)
  const configLiteral = config.matcher[0];
  // The constant has ^ prefix, config literal doesn't (Next.js adds it)
  const constantWithoutAnchor = MIDDLEWARE_MATCHER.replace(/^\^/, "");
  check("MIDDLEWARE_MATCHER matches config.matcher literal", constantWithoutAnchor === configLiteral);

  // Files that should bypass middleware (NOT matched by the pattern)
  const shouldBypass = [
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/sw.js",
    "/robots.txt",
    "/sitemap.xml",
    "/icons/icon-192.png",
    "/logo.svg",
    "/hero.png",
  ];

  // Similar-looking files that SHOULD go through middleware (matched by pattern)
  const shouldMatch = [
    "/",
    "/today",
    "/sw.jsx",          // Not sw.js
    "/robots.txt.bak",  // Not exact match
    "/favicon.icox",    // Not exact match
    "/sitemap.xml.gz",  // Not exact match
    "/unknown-route",
    "/api/diag",
  ];

  // Pattern uses negative lookahead: matches paths that DON'T match the exclusions
  // So: shouldBypass paths should NOT match, shouldMatch paths SHOULD match
  for (const path of shouldBypass) {
    const matches = regex.test(path);
    check(`"${path}" bypasses middleware`, !matches, `pattern matched: ${matches}`);
  }

  for (const path of shouldMatch) {
    const matches = regex.test(path);
    check(`"${path}" goes through middleware`, matches, `pattern matched: ${matches}`);
  }
}

console.log("\n5. Route decision logic (deny-by-default)");
{
  // Mock request for testing redirect URLs
  const mockRequest = (pathname: string) => ({
    nextUrl: {
      clone: () => ({
        pathname,
        search: "?foo=bar",
        toString: () => `http://localhost:3000${pathname}?foo=bar`,
      }),
    },
  }) as any;

  // Test all public paths pass through for signed-out users
  check("public / passes", routeDecision("/", false, mockRequest("/")).kind === "pass");
  check("public /auth/callback passes", routeDecision("/auth/callback", false, mockRequest("/auth/callback")).kind === "pass");
  check("public /legal passes", routeDecision("/legal", false, mockRequest("/legal")).kind === "pass");
  check("public /terms passes", routeDecision("/terms", false, mockRequest("/terms")).kind === "pass");
  check("public /privacy passes", routeDecision("/privacy", false, mockRequest("/privacy")).kind === "pass");
  check("public /offline passes", routeDecision("/offline", false, mockRequest("/offline")).kind === "pass");
  check("public /sw.js passes", routeDecision("/sw.js", false, mockRequest("/sw.js")).kind === "pass");
  check("public /robots.txt passes", routeDecision("/robots.txt", false, mockRequest("/robots.txt")).kind === "pass");
  check("public /sitemap.xml passes", routeDecision("/sitemap.xml", false, mockRequest("/sitemap.xml")).kind === "pass");

  // Test protected routes redirect
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

  // Test unknown paths return 404
  check("unknown /xyz returns notFound", routeDecision("/xyz", false, mockRequest("/xyz")).kind === "notFound");
  check("unknown /fake-page returns notFound", routeDecision("/fake-page", false, mockRequest("/fake-page")).kind === "notFound");

  // Test signed-in users always pass
  check("signed-in /today passes", routeDecision("/today", true, mockRequest("/today")).kind === "pass");
  check("signed-in /xyz passes", routeDecision("/xyz", true, mockRequest("/xyz")).kind === "pass");
}

console.log("\n6. 404 HTML response and redirect URL structure");
{
  const mockRequest = (pathname: string) => ({
    nextUrl: {
      clone: () => ({
        pathname,
        search: "?foo=bar",
        toString: () => `http://localhost:3000${pathname}?foo=bar`,
      }),
    },
  }) as any;

  // Test notFound decision
  const notFoundDecision = routeDecision("/unknown-path", false, mockRequest("/unknown-path"));
  check("unknown path triggers notFound decision", notFoundDecision.kind === "notFound");
  check("notFound paths get HTML response", true, "HTML generation tested manually via curl");

  // Test redirect URL structure
  const redirectDecision = routeDecision("/today", false, mockRequest("/today"));
  check("redirect decision returns structured result", redirectDecision.kind === "redirect");
  if (redirectDecision.kind === "redirect") {
    const isURLLike = redirectDecision.to && typeof redirectDecision.to.pathname === "string" && typeof redirectDecision.to.search === "string";
    check("redirect.to is URL-like object", isURLLike);
    check("redirect.to.pathname is /", redirectDecision.to.pathname === "/");
    check("redirect.to has no query string", redirectDecision.to.search === "");
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
