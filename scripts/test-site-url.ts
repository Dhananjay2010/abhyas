/**
 * Unit tests for getSiteUrl() fallback chain.
 *
 *   npx tsx scripts/test-site-url.ts
 */

import type { MetadataRoute } from "next";
import { getSiteUrl } from "../src/lib/site-url";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. getSiteUrl() basic behavior");
{
  const url = getSiteUrl();
  
  check("returns non-empty string", url.length > 0);
  check("returns valid URL", url.startsWith("http://") || url.startsWith("https://"));
  check("no trailing slash", !url.endsWith("/"));
  check("uses https in production", url.startsWith("https://"));
}

console.log("\n2. Integration with sitemap and robots");
{
  const sitemapData = sitemap();
  const robotsData = robots();

  check("sitemap uses absolute URLs", sitemapData.every((entry: MetadataRoute.Sitemap[number]) => 
    entry.url.startsWith("http://") || entry.url.startsWith("https://")));
  
  check("sitemap URLs have no trailing slash in base", !sitemapData[0].url.endsWith("/"));
  
  const sitemapUrl = typeof robotsData.sitemap === "string" ? robotsData.sitemap : "";
  check("robots sitemap URL is absolute", 
    sitemapUrl.startsWith("http://") || sitemapUrl.startsWith("https://"));
  
  check("sitemap and robots use same base URL", 
    sitemapData[0].url === sitemapUrl.replace("/sitemap.xml", ""));
}

console.log("\n3. URL validation and edge cases");
{
  const url = getSiteUrl();
  
  // Validate it's a proper URL
  let isValidUrl = false;
  try {
    const parsed = new URL(url);
    isValidUrl = true;
    check("parsed URL has protocol", parsed.protocol === "http:" || parsed.protocol === "https:");
    check("parsed URL has hostname", parsed.hostname.length > 0);
  } catch {
    // Will fail the next check
  }
  check("getSiteUrl() returns parseable URL", isValidUrl);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("\n✅ All site-url tests passed\n");
}
