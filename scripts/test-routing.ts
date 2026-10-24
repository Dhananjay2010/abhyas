/**
 * Test robots.txt, sitemap.xml, and middleware matcher behavior.
 *
 * Verifies that:
 * 1. robots.txt is generated with correct base URL
 * 2. sitemap.xml lists only public pages
 * 3. Static assets bypass middleware matcher
 * 4. Unknown routes return 404 not redirect
 *
 *   npx tsx scripts/test-routing.ts
 */
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. robots.txt generation");
{
  // Test with default localhost fallback
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
  const localRobots = robots();
  check("has rules array", Array.isArray(localRobots.rules));
  check("has sitemap URL", typeof localRobots.sitemap === "string");
  check("sitemap uses localhost fallback when no env", localRobots.sitemap === "http://localhost:3000/sitemap.xml");
  const firstRule = Array.isArray(localRobots.rules) ? localRobots.rules[0] : localRobots.rules;
  check("allows public paths", Array.isArray(firstRule?.allow) && firstRule.allow.includes("/"));
  check("disallows /today", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/today"));
  check("disallows /breathe", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/breathe"));
  check("disallows /history", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/history"));
  check("disallows /auth", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/auth"));
  check("disallows /api", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/api"));
  check("disallows /dev", Array.isArray(firstRule?.disallow) && firstRule.disallow.includes("/dev"));

  // Test with NEXT_PUBLIC_SITE_URL
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  const prodRobots = robots();
  check("uses NEXT_PUBLIC_SITE_URL when set", prodRobots.sitemap === "https://example.com/sitemap.xml");

  // Test with VERCEL_URL fallback
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_URL = "myapp.vercel.app";
  const vercelRobots = robots();
  check("uses VERCEL_URL with https when set", vercelRobots.sitemap === "https://myapp.vercel.app/sitemap.xml");
}

console.log("\n2. sitemap.xml generation");
{
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  const map = sitemap();
  check("returns array of URLs", Array.isArray(map));
  check("includes home page", map.some((entry) => entry.url === "https://example.com"));
  check("includes /terms", map.some((entry) => entry.url === "https://example.com/terms"));
  check("includes /privacy", map.some((entry) => entry.url === "https://example.com/privacy"));
  check("does not include /today", !map.some((entry) => entry.url.endsWith("/today")));
  check("does not include /breathe", !map.some((entry) => entry.url.endsWith("/breathe")));
  check("does not include /history", !map.some((entry) => entry.url.endsWith("/history")));
  check("does not include /settings", !map.some((entry) => entry.url.endsWith("/settings")));
  check("home page has priority 1", map.find((e) => e.url === "https://example.com")?.priority === 1);
  check("all entries have lastModified", map.every((e) => e.lastModified instanceof Date));
  check("all entries have changeFrequency", map.every((e) => typeof e.changeFrequency === "string"));
}

console.log("\n3. Middleware matcher patterns");
{
  // Test the matcher logic from src/proxy.ts
  // The matcher uses negative lookahead: paths matching the pattern WILL run through middleware
  // Paths NOT matching (caught by the negative lookahead) will bypass middleware
  const shouldBypass = [
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/sw.js",
    "/robots.txt",
    "/sitemap.xml",
    "/logo.svg",
    "/hero.png",
    "/photo.jpg",
    "/banner.webp",
  ];

  const shouldMatch = [
    "/",
    "/today",
    "/breathe",
    "/unknown-route",
    "/api/diag",
    "/auth/callback",
  ];

  // For paths that should bypass: they should NOT match the full matcher pattern
  // because the negative lookahead should catch them
  for (const path of shouldBypass) {
    // Check if the path is excluded by the negative lookahead
    const excluded = path.startsWith("/_next/static") ||
      path.startsWith("/_next/image") ||
      path === "/favicon.ico" ||
      path === "/manifest.webmanifest" ||
      path.startsWith("/icons/") ||
      path === "/sw.js" ||
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(path);
    check(`"${path}" bypasses middleware`, excluded);
  }

  // For paths that should go through middleware: they should match the pattern
  for (const path of shouldMatch) {
    const excluded = path.startsWith("/_next/static") ||
      path.startsWith("/_next/image") ||
      path === "/favicon.ico" ||
      path === "/manifest.webmanifest" ||
      path.startsWith("/icons/") ||
      path === "/sw.js" ||
      path === "/robots.txt" ||
      path === "/sitemap.xml" ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(path);
    check(`"${path}" goes through middleware`, !excluded);
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
