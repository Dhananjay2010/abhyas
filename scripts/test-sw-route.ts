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

  // Test deterministic output: two consecutive GETs must return identical bodies
  console.log("\n▶ Testing deterministic output (two consecutive GETs)...");
  const response2 = await GET();
  const scriptText2 = await response2.text();
  
  assert(
    scriptText === scriptText2,
    "Two consecutive GET requests to /sw.js must return byte-identical bodies (build version must be deterministic)"
  );
  
  console.log("  ✓ Two consecutive GETs return byte-identical bodies");

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

  // 2. Activate handler: must use injected cachesToDelete function
  assert(
    scriptText.includes("function cachesToDelete"),
    "Service worker must include injected cachesToDelete function"
  );

  assert(
    scriptText.includes("cachesToDelete(cacheNames, CACHE_NAME, brandPrefix)"),
    "Service worker activate handler must call cachesToDelete(cacheNames, CACHE_NAME, brandPrefix)"
  );

  // Verify the injected function has the correct logic
  assert(
    scriptText.includes("cacheName.startsWith(brandPrefix)") || scriptText.includes("cacheName.startsWith("),
    "Injected cachesToDelete must filter by brand prefix (startsWith)"
  );

  assert(
    scriptText.includes("cacheName===currentCacheName") || scriptText.includes("cacheName === currentCacheName"),
    "Injected cachesToDelete must not delete current cache (checks cacheName against currentCacheName)"
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

  // 5. Fetch handler: serve offline page under original URL (no url param needed)
  assert(
    scriptText.includes("window.location") || scriptText.includes("original request URL") || scriptText.includes("correct URL in the address bar"),
    "Service worker fetch handler must document that it serves offline page under original URL"
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
  console.log("  ✓ Documents serving offline page under original URL");
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
