/**
 * Test: Service worker route handler
 *
 * Verifies that the actual script served by src/app/sw.js/route.ts
 * matches the logic and has the correct brand cache prefix, activate filter,
 * precache URLs, and skip rules.
 *
 * This ensures the served SW script stays in sync with sw-logic.ts.
 */

import { GET } from "../src/app/sw.js/route";
import { branding } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

async function testServedServiceWorker() {
  console.log("\n▶ Testing served service worker script...");

  // Call the route handler to get the served script
  const response = await GET();
  const scriptText = await response.text();

  // 1. Brand cache prefix
  const brandPrefix = `${branding.id}-offline-`;
  assert(
    scriptText.includes(`"${brandPrefix}"`),
    `Service worker must use brand prefix "${brandPrefix}" in CACHE_NAME`
  );

  assert(
    scriptText.includes(`const brandPrefix = "${brandPrefix}"`),
    `Service worker activate handler must define brandPrefix constant as "${brandPrefix}"`
  );

  // 2. Activate filter: only delete caches with brand prefix
  assert(
    scriptText.includes("cacheName.startsWith(brandPrefix)"),
    "Service worker activate handler must filter caches by brand prefix (startsWith)"
  );

  assert(
    scriptText.includes("cacheName !== CACHE_NAME"),
    "Service worker activate handler must not delete current cache (cacheName !== CACHE_NAME)"
  );

  assert(
    scriptText.includes("cacheName.startsWith(brandPrefix) && cacheName !== CACHE_NAME"),
    "Service worker activate handler must only delete old caches for this brand (combined condition)"
  );

  // 3. Precache URLs: offline page and icon
  assert(
    scriptText.includes("OFFLINE_URL = \"/offline\""),
    "Service worker must define OFFLINE_URL = \"/offline\""
  );

  assert(
    scriptText.includes(`ICON_URL = "${branding.icons.icon192}"`),
    `Service worker must define ICON_URL = "${branding.icons.icon192}"`
  );

  assert(
    scriptText.includes("cache.addAll"),
    "Service worker install handler must use cache.addAll to precache"
  );

  assert(
    scriptText.includes("OFFLINE_URL") && scriptText.includes("ICON_URL"),
    "Service worker must precache both OFFLINE_URL and ICON_URL"
  );

  // 4. Skip rules: non-GET, /api, /auth, Supabase, RSC
  assert(
    scriptText.includes('request.method !== "GET"'),
    'Service worker must check request.method !== "GET"'
  );

  assert(
    scriptText.includes("Next-Action"),
    "Service worker must check Next-Action header"
  );

  assert(
    scriptText.includes("supabase.co"),
    "Service worker must check supabase.co hostname"
  );

  assert(
    scriptText.includes('pathname.startsWith("/auth")'),
    'Service worker must check pathname.startsWith("/auth")'
  );

  assert(
    scriptText.includes('pathname.startsWith("/api")'),
    'Service worker must check pathname.startsWith("/api")'
  );

  assert(
    scriptText.includes("_rsc"),
    "Service worker must check for RSC requests (_rsc query param)"
  );

  assert(
    scriptText.includes('mode === "navigate"'),
    'Service worker must check mode === "navigate"'
  );

  // 5. Fetch handler: pass original URL to offline page
  assert(
    scriptText.includes("searchParams.set"),
    "Service worker fetch handler must set url query param for original URL"
  );

  assert(
    scriptText.includes("pathname + requestUrl.search") || scriptText.includes("requestUrl.pathname"),
    "Service worker fetch handler must include pathname in url param"
  );

  // 6. Content-Type and Cache-Control headers
  assert(
    scriptText.length > 0,
    "Service worker script must not be empty"
  );

  // Must serve icon cache-first
  assert(
    scriptText.includes("ICON_URL") && scriptText.includes("cache-first"),
    "Service worker must serve icon cache-first for offline page"
  );

  assert(
    scriptText.includes("url.pathname === new URL(ICON_URL"),
    "Service worker must check icon URL pathname explicitly"
  );

  const contentType = response.headers.get("Content-Type");
  assert(
    contentType?.includes("application/javascript") ?? false,
    `Content-Type must be application/javascript, got: ${contentType}`
  );

  const cacheControl = response.headers.get("Cache-Control");
  assert(
    (cacheControl?.includes("max-age=0") && cacheControl?.includes("must-revalidate")) ?? false,
    `Cache-Control must include max-age=0 and must-revalidate, got: ${cacheControl}`
  );

  console.log(`  ✓ Brand prefix is "${brandPrefix}"`);
  console.log("  ✓ Activate handler filters by brand prefix and current cache");
  console.log("  ✓ Precaches OFFLINE_URL and ICON_URL");
  console.log("  ✓ Checks request.method !== 'GET'");
  console.log("  ✓ Checks Next-Action header");
  console.log("  ✓ Checks supabase.co hostname");
  console.log("  ✓ Checks /auth routes");
  console.log("  ✓ Checks /api routes");
  console.log("  ✓ Checks _rsc query param");
  console.log("  ✓ Checks mode === 'navigate'");
  console.log("  ✓ Passes original URL to offline page via query param");
  console.log("  ✓ Serves icon cache-first for offline page");
  console.log("  ✓ Checks icon URL pathname explicitly");
  console.log("  ✓ Content-Type is application/javascript");
  console.log("  ✓ Cache-Control includes max-age=0 and must-revalidate");
}

console.log("Testing Service Worker Route Handler");
console.log("====================================");

testServedServiceWorker().then(
  () => {
    console.log("\n✅ All service worker route handler tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
