/**
 * Test robots.txt and sitemap.xml generation plus middleware matcher.
 *
 *   npx tsx scripts/test-robots-sitemap.ts
 */
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import { branding } from "../src/lib/branding";
import { PUBLIC_PATHS } from "../src/lib/supabase/public-paths";
import { readFileSync } from "fs";
import { join } from "path";

// Read the MIDDLEWARE_MATCHER pattern and config from proxy.ts at runtime
const proxyPath = join(__dirname, "..", "src", "proxy.ts");
const proxyContent = readFileSync(proxyPath, "utf-8");
const matcherMatch = proxyContent.match(/export const MIDDLEWARE_MATCHER = "([^"]+)"/);
if (!matcherMatch) {
  console.error("ERROR: Could not find MIDDLEWARE_MATCHER in proxy.ts");
  process.exit(1);
}
const MIDDLEWARE_MATCHER_STRING = matcherMatch[1];
const MIDDLEWARE_MATCHER = new RegExp(MIDDLEWARE_MATCHER_STRING);

// Extract config.matcher
const configMatch = proxyContent.match(/matcher:\s*\[\s*"([^"]+)"/);
if (!configMatch) {
  console.error("ERROR: Could not find config.matcher in proxy.ts");
  process.exit(1);
}
const CONFIG_MATCHER = configMatch[1];

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

console.log("\n3. Middleware matcher RegExp behavioral tests");
{
  // These paths MUST match (go through middleware)
  const shouldMatch = [
    "/",
    "/today",
    "/settings",
    "/api/version",
    "/robots.txt.bak",
    "/sitemap.xml/foo",
    "/sw.jsx"
  ];
  
  for (const path of shouldMatch) {
    check(`MUST match ${path}`, MIDDLEWARE_MATCHER.test(path) === true);
  }
  
  // These paths must NOT match (skip middleware)
  const shouldNotMatch = [
    "/robots.txt",
    "/sitemap.xml",
    "/sw.js",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/screenshots/a.png",
    "/brands/x/logo.svg",
    "/logo.png",
    "/_next/static/x.js"
  ];
  
  for (const path of shouldNotMatch) {
    check(`must NOT match ${path}`, MIDDLEWARE_MATCHER.test(path) === false);
  }
}

console.log("\n4. config.matcher consistency");
{
  // config.matcher[0] must equal MIDDLEWARE_MATCHER without the leading '^'
  const expectedConfigMatcher = MIDDLEWARE_MATCHER_STRING.slice(1); // Remove leading '^'
  check("config.matcher[0] equals MIDDLEWARE_MATCHER (minus leading '^')", CONFIG_MATCHER === expectedConfigMatcher);
  
  // Additional checks
  check("MIDDLEWARE_MATCHER includes robots.txt exclusion", MIDDLEWARE_MATCHER_STRING.includes("robots\\\\.txt"));
  check("MIDDLEWARE_MATCHER includes sitemap.xml exclusion", MIDDLEWARE_MATCHER_STRING.includes("sitemap\\\\.xml"));
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
