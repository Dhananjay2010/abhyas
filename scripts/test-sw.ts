/**
 * Test: Service worker decision logic
 *
 * Verifies that the offline fallback intercepts the right requests
 * and never caches authenticated or API responses.
 */

import { shouldInterceptForOffline, getCacheName } from "../src/lib/sw-logic";
import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testShouldInterceptForOffline() {
  console.log("\n▶ Testing shouldInterceptForOffline...");

  // GET full-page navigations: should intercept
  assert(
    shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "GET",
      mode: "navigate",
      destination: "document",
    }),
    "Should intercept GET full-page navigation to /today"
  );

  assert(
    shouldInterceptForOffline({
      url: "https://example.com/",
      method: "GET",
      mode: "navigate",
      destination: "document",
    }),
    "Should intercept GET full-page navigation to /"
  );

  // POST requests: NEVER intercept (must fail visibly)
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "POST",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept POST request (must fail visibly)"
  );

  // Server actions (Next-Action header): NEVER intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "POST",
      mode: "cors",
      destination: "",
      headers: { "Next-Action": "abc123" },
    }),
    "Should NOT intercept server action (POST with Next-Action header)"
  );

  // PUT/DELETE: never intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "PUT",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept PUT request"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "DELETE",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept DELETE request"
  );

  // RSC requests (App Router): should NOT intercept
  // These have RSC: 1 header or _rsc query param
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today?_rsc=abc123",
      method: "GET",
      mode: "cors",
      destination: "",
      hasRscQuery: true,
    }),
    "Should NOT intercept RSC request with _rsc query param"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
      method: "GET",
      mode: "cors",
      destination: "",
      headers: { "RSC": "1" },
    }),
    "Should NOT intercept RSC request with RSC: 1 header"
  );

  // Supabase API calls: never intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://myproject.supabase.co/rest/v1/workouts",
      method: "GET",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept Supabase API call"
  );

  // /auth routes: never intercept (OAuth callbacks, session management)
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/auth/callback",
      method: "GET",
      mode: "navigate",
      destination: "document",
    }),
    "Should NOT intercept /auth/callback (OAuth)"
  );

  // /api routes: never intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/some-endpoint",
      method: "GET",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept GET to /api route"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/logSet",
      method: "POST",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept POST to /api route"
  );

  // Static assets: never intercept (no caching, offline means offline)
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/_next/static/chunks/app.js",
      method: "GET",
      mode: "no-cors",
      destination: "script",
    }),
    "Should NOT intercept static JS file"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/_next/static/css/app.css",
      method: "GET",
      mode: "no-cors",
      destination: "style",
    }),
    "Should NOT intercept CSS file"
  );

  console.log("  ✓ GET full-page navigations are intercepted");
  console.log("  ✓ POST requests are NEVER intercepted (fail visibly)");
  console.log("  ✓ Server actions (Next-Action header) are NEVER intercepted");
  console.log("  ✓ PUT/DELETE requests are NEVER intercepted");
  console.log("  ✓ RSC requests (App Router) are never intercepted");
  console.log("  ✓ Supabase API calls are never intercepted");
  console.log("  ✓ /auth routes are never intercepted");
  console.log("  ✓ /api routes are never intercepted");
  console.log("  ✓ Static assets are never intercepted");
}

function testGetCacheName() {
  console.log("\n▶ Testing cache name versioning...");

  // With a brand ID and build ID (production)
  const nameWithBuild = getCacheName("abhyas", "abc123def");
  assert(
    nameWithBuild === "abhyas-offline-abc123def",
    `Cache name with brand and build ID should be 'abhyas-offline-abc123def', got '${nameWithBuild}'`
  );

  // Without a build ID (dev or fallback)
  const nameWithoutBuild = getCacheName("abhyas");
  assert(
    nameWithoutBuild === "abhyas-offline-v1",
    `Cache name without build ID should be 'abhyas-offline-v1', got '${nameWithoutBuild}'`
  );

  // Different build IDs produce different cache names
  const name1 = getCacheName("abhyas", "build1");
  const name2 = getCacheName("abhyas", "build2");
  assert(
    name1 !== name2,
    "Different build IDs should produce different cache names"
  );

  // Different brand IDs produce different cache names
  const brand1 = getCacheName("abhyas", "abc123");
  const brand2 = getCacheName("otherbrand", "abc123");
  assert(
    brand1 !== brand2,
    "Different brand IDs should produce different cache names"
  );

  console.log("  ✓ Cache name includes brand ID and build ID when present");
  console.log("  ✓ Cache name falls back to 'v1' without build ID");
  console.log("  ✓ Different build IDs produce different cache names");
  console.log("  ✓ Different brand IDs produce different cache names");
}

function testServiceWorkerConsistency() {
  console.log("\n▶ Testing service worker route handler consistency...");

  // The service worker is generated by src/app/sw.js/route.ts
  // We need to verify it contains the correct logic to match sw-logic.ts

  const swRoutePath = path.join(__dirname, "..", "src", "app", "sw.js", "route.ts");
  const swRouteSource = fs.readFileSync(swRoutePath, "utf-8");

  // Critical checks: the SW must check method !== "GET" first
  assert(
    swRouteSource.includes('if (request.method !== "GET")') ||
    swRouteSource.includes("if (request.method !== 'GET')") ||
    swRouteSource.includes('request.method !== "GET"'),
    "Service worker must check request.method !== 'GET' to reject non-GET requests"
  );

  // Must check for Next-Action header
  assert(
    swRouteSource.includes("Next-Action") || swRouteSource.includes("next-action"),
    "Service worker must check Next-Action header for server actions"
  );

  // Must check /api routes
  assert(
    swRouteSource.includes('"/api"') || swRouteSource.includes("'/api'"),
    "Service worker must check /api routes"
  );

  // Early return for non-GET requests (not respondWith)
  // The pattern matches multiline format: if (...method !== "GET") { return; }
  const nonGetPattern = /if\s*\(\s*[^)]*\.method\s*!==\s*["']GET["']\s*\)\s*\{\s*return;\s*\}/;
  assert(
    nonGetPattern.test(swRouteSource.replace(/\n/g, " ")),
    "Service worker must return early (not call respondWith) for non-GET requests"
  );

  // Must precache the app icon (so offline page can display it)
  assert(
    swRouteSource.includes("ICON_URL") && swRouteSource.includes("branding.icons.icon192"),
    "Service worker must include app icon URL from branding"
  );

  assert(
    swRouteSource.includes("cache.addAll") || (swRouteSource.includes("ICON_URL") && swRouteSource.includes("cache.add")),
    "Service worker must precache both offline page and icon"
  );

  console.log("  ✓ Service worker checks request.method !== 'GET'");
  console.log("  ✓ Service worker has early return for non-GET requests");
  console.log("  ✓ Service worker checks Next-Action header");
  console.log("  ✓ Service worker checks /api routes");
  console.log("  ✓ Non-GET requests go straight to network (fail visibly)");
  console.log("  ✓ Service worker precaches app icon from branding");
}

console.log("Testing Service Worker Logic");
console.log("============================");

testShouldInterceptForOffline();
testGetCacheName();
testServiceWorkerConsistency();

console.log("\n✅ All service worker tests passed\n");
