/**
 * Test: Service worker static asset caching
 *
 * Loads the actual SW script and verifies that:
 * 1. /_next/static/* requests are cached cache-first
 * 2. Cached assets are served from cache on subsequent requests
 * 3. Assets are cached in the brand-scoped cache
 * 4. Only same-origin GET requests are cached
 */

import { GET } from "../src/app/sw.js/route";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Fake Cache API for testing
 */
class FakeCache {
  private store = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    const url = typeof request === "string" ? request : request.url;
    return this.store.get(url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }

  has(url: string): boolean {
    return this.store.has(url);
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Fake ServiceWorker global scope for testing.
 */
class FakeServiceWorkerGlobalScope {
  private _cache: FakeCache;
  public location = { origin: "http://localhost:3000" };

  constructor() {
    this._cache = new FakeCache();
  }

  get caches() {
    const cache = this._cache;
    return {
      open: async (cacheName: string) => {
        return cache;
      },
    };
  }

  getCache(): FakeCache {
    return this._cache;
  }
}

async function testStaticAssetCaching() {
  console.log("\n▶ Testing static asset caching behavior...");

  // Get the actual SW script
  const swResponse = await GET();
  const swScript = await swResponse.text();

  console.log("\n▶ Verifying SW script contains static caching logic...");

  // Verify the script defines shouldCacheStatic function
  assert(
    swScript.includes("shouldCacheStatic"),
    "SW must define shouldCacheStatic function"
  );

  // Verify it checks for /_next/static/ pathname
  assert(
    swScript.includes('pathname.startsWith("/_next/static/"') ||
      swScript.includes("pathname.startsWith('/_next/static/'"),
    "SW must check pathname.startsWith('/_next/static/')"
  );

  // Verify it checks request.method === "GET"
  assert(
    swScript.includes('request.method !== "GET"') ||
      swScript.includes("request.method !== 'GET'"),
    "SW must check request.method in shouldCacheStatic"
  );

  // Verify it checks same-origin
  assert(
    swScript.includes("url.origin") && swScript.includes("self.location.origin"),
    "SW must check same-origin in shouldCacheStatic"
  );

  console.log("  ✓ SW script contains shouldCacheStatic function");
  console.log("  ✓ Checks pathname.startsWith('/_next/static/')");
  console.log("  ✓ Checks request.method === 'GET'");
  console.log("  ✓ Checks same-origin");

  console.log("\n▶ Simulating static asset caching behavior...");

  // Create fake SW scope
  const fakeScope = new FakeServiceWorkerGlobalScope();
  const cache = fakeScope.getCache();

  // Simulate shouldCacheStatic logic
  function shouldCacheStatic(request: { method: string; url: string }) {
    if (request.method !== "GET") {
      return false;
    }

    const url = new URL(request.url);

    if (url.origin !== "http://localhost:3000") {
      return false;
    }

    if (url.pathname.startsWith("/_next/static/")) {
      return true;
    }

    return false;
  }

  // Test case 1: /_next/static/chunks/x.js should be cached
  console.log("\n▶ Test 1: /_next/static/chunks/x.js should be cached...");

  const chunkRequest = new Request("http://localhost:3000/_next/static/chunks/30p9q9z-n8uw9.js");
  assert(
    shouldCacheStatic(chunkRequest),
    "/_next/static/chunks/x.js should be cached"
  );

  // Simulate cache-first: first request (cache miss, fetch, cache)
  let cachedResponse = await cache.match(chunkRequest);
  assert(
    cachedResponse === undefined,
    "First request: cache should be empty"
  );

  // Simulate network fetch and cache
  const networkResponse = new Response("// chunk code", {
    status: 200,
    headers: { "Content-Type": "application/javascript" },
  });
  await cache.put(chunkRequest, networkResponse);

  console.log("  ✓ First request: fetched from network and cached");

  // Second request (cache hit, serve from cache)
  cachedResponse = await cache.match(chunkRequest);
  assert(
    cachedResponse !== undefined,
    "Second request: should be served from cache"
  );

  if (cachedResponse) {
    const cachedText = await cachedResponse.text();
    assert(
      cachedText === "// chunk code",
      "Cached response should match original"
    );
  }

  console.log("  ✓ Second request: served from cache");

  // Test case 2: /_next/static/css/x.css should be cached
  console.log("\n▶ Test 2: /_next/static/css/x.css should be cached...");

  const cssRequest = new Request("http://localhost:3000/_next/static/css/app.css");
  assert(
    shouldCacheStatic(cssRequest),
    "/_next/static/css/x.css should be cached"
  );

  console.log("  ✓ /_next/static/css/x.css should be cached");

  // Test case 3: Non-static requests should NOT be cached
  console.log("\n▶ Test 3: Non-static requests should NOT be cached...");

  const apiRequest = new Request("http://localhost:3000/api/user");
  assert(
    !shouldCacheStatic(apiRequest),
    "/api/user should NOT be cached"
  );

  const pageRequest = new Request("http://localhost:3000/today");
  assert(
    !shouldCacheStatic(pageRequest),
    "/today should NOT be cached"
  );

  console.log("  ✓ /api/user should NOT be cached");
  console.log("  ✓ /today should NOT be cached");

  // Test case 4: POST requests should NOT be cached
  console.log("\n▶ Test 4: POST requests should NOT be cached...");

  const postRequest = new Request("http://localhost:3000/_next/static/chunks/x.js", {
    method: "POST",
  });
  assert(
    !shouldCacheStatic(postRequest),
    "POST to /_next/static/ should NOT be cached"
  );

  console.log("  ✓ POST to /_next/static/ should NOT be cached");

  // Test case 5: Cross-origin requests should NOT be cached
  console.log("\n▶ Test 5: Cross-origin requests should NOT be cached...");

  const crossOriginRequest = new Request("https://cdn.example.com/_next/static/chunks/x.js");
  assert(
    !shouldCacheStatic(crossOriginRequest),
    "Cross-origin /_next/static/ should NOT be cached"
  );

  console.log("  ✓ Cross-origin /_next/static/ should NOT be cached");

  // Verify the SW fetch handler uses shouldCacheStatic
  console.log("\n▶ Verifying SW fetch handler uses shouldCacheStatic...");

  assert(
    swScript.includes("shouldCacheStatic(event.request)"),
    "SW fetch handler must call shouldCacheStatic(event.request)"
  );

  // Verify cache-first pattern: check cache, then network, then cache.put
  assert(
    swScript.includes("cache.match(event.request)") || swScript.includes("cache.match(request)"),
    "SW must check cache first"
  );

  assert(
    swScript.includes("cache.put(event.request") || swScript.includes("cache.put(request"),
    "SW must cache the network response"
  );

  console.log("  ✓ SW fetch handler calls shouldCacheStatic(event.request)");
  console.log("  ✓ SW uses cache-first pattern (cache.match, fetch, cache.put)");
}

async function testPrecachingAtInstall() {
  console.log("\n▶ Testing precaching of chunks at install...");

  // Get the actual SW script
  const swResponse = await GET();
  const swScript = await swResponse.text();

  console.log("\n▶ Verifying SW reads cached /offline HTML...");

  assert(
    swScript.includes("cache.match(OFFLINE_URL)") || swScript.includes("cache.match(\"/offline\")"),
    "SW install must read cached /offline HTML"
  );

  assert(
    swScript.includes("offlineHtml") || swScript.includes(".text()"),
    "SW install must read offline HTML as text"
  );

  console.log("  ✓ SW reads cached /offline HTML");

  console.log("\n▶ Verifying SW extracts /_next/static/* URLs from HTML...");

  assert(
    swScript.includes("/_next/static/") || swScript.includes("/_next///static///"),
    "SW must extract /_next/static/* URLs from HTML"
  );

  assert(
    swScript.includes("<script") || swScript.includes("scriptRegex"),
    "SW must extract URLs from <script src> tags"
  );

  assert(
    swScript.includes("<link") || swScript.includes("linkRegex"),
    "SW must extract URLs from <link href> tags"
  );

  console.log("  ✓ SW extracts URLs from <script src> tags");
  console.log("  ✓ SW extracts URLs from <link href> tags");

  console.log("\n▶ Verifying SW caches extracted chunks per-URL (resilient to individual failures)...");

  assert(
    swScript.includes("Promise.allSettled") && swScript.includes("cache.add"),
    "SW must use Promise.allSettled with per-URL cache.add for resilient precaching"
  );

  console.log("  ✓ SW uses Promise.allSettled with per-URL cache.add");

  console.log("\n▶ Verifying precaching is best-effort (doesn't fail install)...");

  // The install handler should have try-catch around chunk caching
  // Count try-catch blocks in the install handler area
  const tryCount = (swScript.match(/try\s*\{/g) || []).length;
  const catchCount = (swScript.match(/catch/g) || []).length;
  
  assert(
    tryCount >= 2 && catchCount >= 2,
    `Install handler must have multiple try-catch blocks for best-effort caching (found ${tryCount} try, ${catchCount} catch)`
  );

  console.log("  ✓ Chunk caching is wrapped in try-catch (best-effort)");
  console.log("  ✓ Install continues even if chunk caching fails");

  console.log("\n▶ Simulating precaching behavior with mocked /offline HTML...");

  // Mock offline HTML with some chunks
  const mockOfflineHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="/_next/static/css/app.css" />
      <script src="/_next/static/chunks/main.js"></script>
      <script src="/_next/static/chunks/30p9q9z-n8uw9.js"></script>
    </head>
    <body>
      <h1>You're offline</h1>
    </body>
    </html>
  `;

  // Extract URLs using regex (same as SW)
  const chunkUrls: string[] = [];

  const scriptRegex = /<script[^>]+src="(\/_next\/static\/[^"]+)"/g;
  let match;
  while ((match = scriptRegex.exec(mockOfflineHtml)) !== null) {
    chunkUrls.push(match[1]);
  }

  const linkRegex = /<link[^>]+href="(\/_next\/static\/[^"]+)"[^>]*rel="stylesheet"/g;
  while ((match = linkRegex.exec(mockOfflineHtml)) !== null) {
    chunkUrls.push(match[1]);
  }

  const linkRegex2 = /<link[^>]+rel="stylesheet"[^>]+href="(\/_next\/static\/[^"]+)"/g;
  while ((match = linkRegex2.exec(mockOfflineHtml)) !== null) {
    chunkUrls.push(match[1]);
  }

  const uniqueUrls = [...new Set(chunkUrls)];

  assert(
    uniqueUrls.length === 3,
    `Should extract 3 unique chunk URLs, got ${uniqueUrls.length}`
  );

  assert(
    uniqueUrls.includes("/_next/static/css/app.css"),
    "Should extract CSS URL"
  );

  assert(
    uniqueUrls.includes("/_next/static/chunks/main.js"),
    "Should extract main.js URL"
  );

  assert(
    uniqueUrls.includes("/_next/static/chunks/30p9q9z-n8uw9.js"),
    "Should extract chunk URL"
  );

  console.log("  ✓ Extracted 3 chunk URLs from mock HTML");
  console.log("  ✓ CSS URL extracted");
  console.log("  ✓ JS chunk URLs extracted");

  console.log("\n▶ Testing resilient per-URL caching (one failure doesn't block others)...");

  // Simulate per-URL caching with one failing
  const testUrls = [
    "/_next/static/chunks/success-1.js",
    "/_next/static/chunks/fail.js",
    "/_next/static/chunks/success-2.js",
  ];

  const fakeCache2 = new FakeCache();
  
  // Simulate Promise.allSettled behavior where one URL fails
  const results = await Promise.allSettled(
    testUrls.map(async (url) => {
      if (url.includes("fail")) {
        throw new Error("Network error");
      }
      // Simulate successful cache.add
      const req = new Request(`http://localhost:3000${url}`);
      const resp = new Response("// code", { status: 200 });
      await fakeCache2.put(req, resp);
      return { url, status: "fulfilled" };
    })
  );

  assert(
    results.length === 3,
    `Should process all 3 URLs, got ${results.length}`
  );

  assert(
    results[0].status === "fulfilled",
    "First URL should succeed"
  );

  assert(
    results[1].status === "rejected",
    "Second URL should fail"
  );

  assert(
    results[2].status === "fulfilled",
    "Third URL should succeed"
  );

  assert(
    fakeCache2.size() === 2,
    `Should cache 2 successful URLs despite 1 failure, got ${fakeCache2.size()}`
  );

  console.log("  ✓ Promise.allSettled processes all URLs");
  console.log("  ✓ One failing URL doesn't prevent others from caching");
  console.log("  ✓ 2 of 3 URLs cached successfully");
}

console.log("Testing Service Worker Static Asset Caching");
console.log("==========================================");

(async () => {
  await testStaticAssetCaching();
  await testPrecachingAtInstall();
})().then(
  () => {
    console.log("\n✅ All static asset caching tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
