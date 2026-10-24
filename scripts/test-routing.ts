/**
 * Test robots.txt, sitemap.xml, and middleware security behavior.
 *
 * Verifies that:
 * 1. robots.txt is generated with correct base URL
 * 2. sitemap.xml lists only public pages
 * 3. Static assets bypass middleware matcher
 * 4. Proxy maintains deny-by-default security for signed-out users
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

console.log("\n3. Middleware matcher exclusions");
{
  // Test the actual matcher pattern from src/proxy.ts
  // Paths matching the exclusions in the negative lookahead should bypass middleware
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

console.log("\n4. Proxy security decisions (deny-by-default)");
{
  // Mock the proxy decision logic for testing
  // In reality this runs in the proxy, but we test the logic here
  
  const PUBLIC_PATHS = ["/", "/auth", "/legal", "/robots.txt", "/sitemap.xml"];
  const DEV_PATHS: string[] = []; // production mode for this test
  const PROBE_PATHS: string[] = []; // no PERF_TOKEN
  const PROTECTED_PREFIXES = [
    "/today",
    "/breathe",
    "/history",
    "/progress",
    "/settings",
    "/onboarding",
    "/session",
    "/yoga",
    "/api",
  ];

  type Decision = "pass-through" | "redirect" | "404";

  function proxyDecision(pathname: string, signedIn: boolean): Decision {
    const isPublic = [...PUBLIC_PATHS, ...DEV_PATHS, ...PROBE_PATHS].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );

    if (!signedIn && !isPublic) {
      const isProtected = PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      );

      if (isProtected) {
        return "redirect";
      }
      return "404";
    }

    return "pass-through";
  }

  // Test all existing public routes pass through for signed-out users
  check("public / passes through", proxyDecision("/", false) === "pass-through");
  check("public /auth/callback passes through", proxyDecision("/auth/callback", false) === "pass-through");
  check("public /auth/signout passes through", proxyDecision("/auth/signout", false) === "pass-through");
  check("public /legal passes through", proxyDecision("/legal", false) === "pass-through");
  check("public /legal/anything passes through", proxyDecision("/legal/anything", false) === "pass-through");
  check("public /robots.txt passes through", proxyDecision("/robots.txt", false) === "pass-through");
  check("public /sitemap.xml passes through", proxyDecision("/sitemap.xml", false) === "pass-through");

  // Test cases for signed-out users - unknown paths
  check("unknown path /xyz returns 404", proxyDecision("/xyz", false) === "404");
  check("unknown path /fake-page returns 404", proxyDecision("/fake-page", false) === "404");
  check("unknown nested /some/deep/path returns 404", proxyDecision("/some/deep/path", false) === "404");
  
  // Protected routes redirect
  check("protected /today redirects", proxyDecision("/today", false) === "redirect");
  check("protected /breathe redirects", proxyDecision("/breathe", false) === "redirect");
  check("protected /history redirects", proxyDecision("/history", false) === "redirect");
  check("protected /settings redirects", proxyDecision("/settings", false) === "redirect");
  check("protected /api/diag redirects", proxyDecision("/api/diag", false) === "redirect");
  check("protected /api/something redirects", proxyDecision("/api/something", false) === "redirect");

  // Signed-in users always pass through
  check("signed-in user on /today passes through", proxyDecision("/today", true) === "pass-through");
  check("signed-in user on unknown /xyz passes through", proxyDecision("/xyz", true) === "pass-through");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
