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

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/logSet",
      method: "POST",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept POST to /api (must fail visibly)"
  );

  // Server actions (POST with Next-Action header): NEVER intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/",
      method: "POST",
      mode: "cors",
      destination: "",
      headers: { "Next-Action": "abc123" },
    }),
    "Should NOT intercept server action (POST with Next-Action header)"
  );

  // PUT/DELETE requests: NEVER intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/update",
      method: "PUT",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept PUT request"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/delete",
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

  // Supabase API: never intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://brldynuhozaszaduwfse.supabase.co/rest/v1/sessions",
      method: "GET",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept Supabase API call"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://brldynuhozaszaduwfse.supabase.co/auth/v1/token",
      method: "POST",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept Supabase auth POST"
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
    "Should NOT intercept JS chunks"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/icons/icon-192.png",
      method: "GET",
      mode: "no-cors",
      destination: "image",
    }),
    "Should NOT intercept icon"
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

  // With a build ID
  const nameWithBuild = getCacheName("abc123def");
  assert(
    nameWithBuild === "abhyas-offline-abc123def",
    `Cache name with build ID should be 'abhyas-offline-abc123def', got '${nameWithBuild}'`
  );

  // Without a build ID (dev or fallback)
  const nameWithoutBuild = getCacheName();
  assert(
    nameWithoutBuild === "abhyas-offline-v1",
    `Cache name without build ID should be 'abhyas-offline-v1', got '${nameWithoutBuild}'`
  );

  // Different build IDs produce different cache names
  const name1 = getCacheName("build1");
  const name2 = getCacheName("build2");
  assert(
    name1 !== name2,
    "Different build IDs should produce different cache names"
  );

  console.log("  ✓ Cache name includes build ID when present");
  console.log("  ✓ Cache name falls back to 'v1' without build ID");
  console.log("  ✓ Different build IDs produce different cache names");
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
    "Service worker must check for Next-Action header (server actions)"
  );

  // Must check for /api routes
  assert(
    swRouteSource.includes('/api') && swRouteSource.includes('startsWith'),
    "Service worker must check for /api routes"
  );

  // Must have early return for non-GET in fetch listener
  assert(
    swRouteSource.includes('if (event.request.method !== "GET")'),
    "Service worker fetch listener must have early return for non-GET requests"
  );

  // Critical: must NOT call respondWith for non-GET requests
  // Find the fetch event listener (multiline match)
  const fetchListenerMatch = swRouteSource.match(/addEventListener\("fetch"[\s\S]+?\n\}\);/);
  if (fetchListenerMatch) {
    const fetchListener = fetchListenerMatch[0];
    // Check that the first if statement returns early for non-GET
    const lines = fetchListener.split('\n');
    let foundMethodCheck = false;
    let foundEarlyReturn = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('method !== "GET"')) {
        foundMethodCheck = true;
        // Next non-empty line should be return or contain return in same line
        if (lines[i].includes('return')) {
          foundEarlyReturn = true;
          break;
        }
        for (let j = i + 1; j < lines.length && j < i + 5; j++) {
          if (lines[j].trim().startsWith('return')) {
            foundEarlyReturn = true;
            break;
          }
        }
        break;
      }
    }
    assert(
      foundMethodCheck && foundEarlyReturn,
      "Service worker must return early for non-GET requests (no respondWith)"
    );
  }

  console.log("  ✓ Service worker checks request.method !== 'GET'");
  console.log("  ✓ Service worker has early return for non-GET requests");
  console.log("  ✓ Service worker checks Next-Action header");
  console.log("  ✓ Service worker checks /api routes");
  console.log("  ✓ Non-GET requests go straight to network (fail visibly)");
}

function main() {
  console.log("Testing Service Worker Logic");
  console.log("============================");

  try {
    testShouldInterceptForOffline();
    testGetCacheName();
    testServiceWorkerConsistency();

    console.log("\n✅ All service worker tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
