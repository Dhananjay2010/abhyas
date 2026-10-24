/**
 * Test robots.txt and sitemap.xml generation plus middleware matcher.
 *
 *   npx tsx scripts/test-robots-sitemap.ts
 */
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { branding } from "../src/lib/branding";
import { PUBLIC_PATHS } from "../src/lib/supabase/public-paths";
import { MIDDLEWARE_MATCHER, config } from "../src/proxy";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. robots.txt generation");
{
  const robotsTxt = robots();
  check("has rules array", Array.isArray(robotsTxt.rules));
  check("has sitemap URL", typeof robotsTxt.sitemap === "string");
  check("sitemap uses branding.siteUrl", robotsTxt.sitemap === `${branding.siteUrl}/sitemap.xml`);
  
  const firstRule = Array.isArray(robotsTxt.rules) ? robotsTxt.rules[0] : robotsTxt.rules;
  const allowed = Array.isArray(firstRule?.allow) ? firstRule.allow : [];
  const disallowed = Array.isArray(firstRule?.disallow) ? firstRule.disallow : [];
  
  check("allows /", allowed.includes("/"));
  check("allows /terms", allowed.includes("/terms"));
  check("allows /privacy", allowed.includes("/privacy"));
  
  const privateRoutes = ["/today", "/breathe", "/history", "/progress", "/settings", "/onboarding", "/session", "/yoga", "/auth", "/api", "/dev"];
  for (const route of privateRoutes) {
    check(`disallows ${route}`, disallowed.includes(route));
  }
}

console.log("\n2. sitemap.xml generation");
{
  const sitemapData = sitemap();
  check("has exactly 3 entries", sitemapData.length === 3);
  
  const urls = sitemapData.map(entry => entry.url);
  check("includes branding.siteUrl", urls.includes(branding.siteUrl));
  check("includes /terms", urls.includes(`${branding.siteUrl}/terms`));
  check("includes /privacy", urls.includes(`${branding.siteUrl}/privacy`));
  
  for (const entry of sitemapData) {
    check(`URL starts with branding.siteUrl: ${entry.url}`, entry.url.startsWith(branding.siteUrl));
  }
  
  // Test determinism
  const sitemapData2 = sitemap();
  const equal = JSON.stringify(sitemapData) === JSON.stringify(sitemapData2);
  check("deterministic (two calls deep-equal)", equal);
  
  const firstEntry = sitemapData[0];
  check("lastModified is fixed constant", firstEntry.lastModified instanceof Date);
}

console.log("\n3. Middleware matcher behavioral tests (using exported config.matcher)");
{
  // Use the REAL exported config.matcher from proxy
  const configMatcherPattern = config.matcher[0];
  const regex = new RegExp(configMatcherPattern);
  
  // These paths MUST match (go through middleware)
  const shouldMatch = [
    "/",
    "/today",
    "/settings",
    "/api/version",
    "/robots.txt.bak",
    "/sitemap.xml/foo",
    "/sw.jsx",
    "/today.extra-route-like"
  ];
  
  for (const path of shouldMatch) {
    check(`MUST match ${path}`, regex.test(path) === true);
  }
  
  // These paths must NOT match (skip middleware - excluded)
  const shouldNotMatch = [
    "/robots.txt",
    "/sitemap.xml",
    "/sw.js",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/icons/a/b.png",  // nested asset
    "/screenshots/a.png",
    "/_next/static/x.js",
    "/_next/static/x/y.svg",  // nested asset
    "/logo.png",
    "/brands/x/logo.svg"
  ];
  
  for (const path of shouldNotMatch) {
    check(`must NOT match ${path}`, regex.test(path) === false);
  }
}

console.log("\n4. config.matcher consistency");
{
  // Verify MIDDLEWARE_MATCHER string and config.matcher[0] are consistent
  const middlewareRegex = new RegExp(MIDDLEWARE_MATCHER);
  const configRegex = new RegExp(config.matcher[0]);
  
  // They should have the same behavior (MIDDLEWARE_MATCHER has ^ prefix, config doesn't)
  const testPaths = ["/robots.txt", "/today", "/logo.png", "/icons/a/b.png"];
  let consistent = true;
  for (const path of testPaths) {
    if (middlewareRegex.test(path) !== configRegex.test(path)) {
      consistent = false;
      break;
    }
  }
  
  check("MIDDLEWARE_MATCHER and config.matcher have consistent behavior", consistent);
  check("MIDDLEWARE_MATCHER includes robots.txt exclusion", MIDDLEWARE_MATCHER.includes("robots\\\\.txt"));
  check("MIDDLEWARE_MATCHER includes sitemap.xml exclusion", MIDDLEWARE_MATCHER.includes("sitemap\\\\.xml"));
  check("MIDDLEWARE_MATCHER uses any-depth image pattern (.*\\\\.)", MIDDLEWARE_MATCHER.includes(".*\\\\."));
}

console.log("\n5. PUBLIC_PATHS includes SEO routes");
{
  check("PUBLIC_PATHS includes /robots.txt", PUBLIC_PATHS.includes("/robots.txt"));
  check("PUBLIC_PATHS includes /sitemap.xml", PUBLIC_PATHS.includes("/sitemap.xml"));
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("\n✅ All robots and sitemap tests passed\n");
}
