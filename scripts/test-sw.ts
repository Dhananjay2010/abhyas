/**
 * Test: Service worker decision logic
 *
 * Verifies that the offline fallback intercepts the right requests
 * and never caches authenticated or API responses.
 */

import { shouldInterceptForOffline, getCacheName } from "../src/lib/sw-logic";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testShouldInterceptForOffline() {
  console.log("\n▶ Testing shouldInterceptForOffline...");

  // Full-page navigations: should intercept
  assert(
    shouldInterceptForOffline({
      url: "https://example.com/today",
      mode: "navigate",
      destination: "document",
    }),
    "Should intercept full-page navigation to /today"
  );

  assert(
    shouldInterceptForOffline({
      url: "https://example.com/",
      mode: "navigate",
      destination: "document",
    }),
    "Should intercept full-page navigation to /"
  );

  // RSC requests (App Router): should NOT intercept
  // These have RSC: 1 header or _rsc query param
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today?_rsc=abc123",
      mode: "cors",
      destination: "",
      hasRscQuery: true,
    }),
    "Should NOT intercept RSC request with _rsc query param"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/today",
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
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept Supabase API call"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://brldynuhozaszaduwfse.supabase.co/auth/v1/token",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept Supabase auth call"
  );

  // /auth routes: never intercept (OAuth callbacks, session management)
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/auth/callback",
      mode: "navigate",
      destination: "document",
    }),
    "Should NOT intercept /auth/callback (OAuth)"
  );

  // Static assets: never intercept (no caching, offline means offline)
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/_next/static/chunks/app.js",
      mode: "no-cors",
      destination: "script",
    }),
    "Should NOT intercept JS chunks"
  );

  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/icons/icon-192.png",
      mode: "no-cors",
      destination: "image",
    }),
    "Should NOT intercept icon (not precached for /offline route)"
  );

  // API routes: never intercept
  assert(
    !shouldInterceptForOffline({
      url: "https://example.com/api/some-endpoint",
      mode: "cors",
      destination: "",
    }),
    "Should NOT intercept API route"
  );

  console.log("  ✓ Full-page navigations are intercepted");
  console.log("  ✓ RSC requests (App Router) are never intercepted");
  console.log("  ✓ Supabase API calls are never intercepted");
  console.log("  ✓ /auth routes are never intercepted");
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

function main() {
  console.log("Testing Service Worker Logic");
  console.log("============================");

  try {
    testShouldInterceptForOffline();
    testGetCacheName();

    console.log("\n✅ All service worker tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
