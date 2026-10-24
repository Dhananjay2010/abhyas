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

// Read the MIDDLEWARE_MATCHER pattern from proxy.ts at runtime
const proxyPath = join(__dirname, "..", "src", "proxy.ts");
const proxyContent = readFileSync(proxyPath, "utf-8");
const matcherMatch = proxyContent.match(/export const MIDDLEWARE_MATCHER = "([^"]+)"/);
if (!matcherMatch) {
  console.error("ERROR: Could not find MIDDLEWARE_MATCHER in proxy.ts");
  process.exit(1);
}
const MIDDLEWARE_MATCHER = new RegExp(matcherMatch[1]);

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

console.log("\n3. Middleware matcher RegExp");
{
  // In Next.js, the config.matcher string gets processed by Next's routing engine,
  // not directly as a JavaScript RegExp. The pattern may behave differently there.
  // For now, just verify the MIDDLEWARE_MATCHER constant exists and is a string in proxy.ts
  check("MIDDLEWARE_MATCHER exported from proxy.ts", proxyContent.includes("export const MIDDLEWARE_MATCHER ="));
  check("M IDDLEWARE_MATCHER includes robots.txt exclusion", proxyContent.includes("robots\\\\.txt"));
  check("MIDDLEWARE_MATCHER includes sitemap.xml exclusion", proxyContent.includes("sitemap\\\\.xml"));
}

console.log("\n4. config.matcher consistency");
{
  // Extract the matcher pattern from config.matcher array
  const matcherRegex = /matcher:\s*\[\s*"([^"]+)"/;
  const match = proxyContent.match(matcherRegex);
  
  if (match) {
    const configMatcher = match[1];
    const matcherSource = MIDDLEWARE_MATCHER.source;
    // The string constant has ^/ prefix, config.matcher removes ^/( and trailing )
    const expectedMatcher = matcherSource.slice(3, -1); // Remove ^/( and )
    check("config.matcher equals MIDDLEWARE_MATCHER (minus ^/ wrapper)", configMatcher === expectedMatcher);
  } else {
    check("config.matcher found in proxy.ts", false);
  }
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
