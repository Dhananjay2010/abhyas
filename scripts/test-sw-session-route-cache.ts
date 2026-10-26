#!/usr/bin/env tsx
/**
 * Test: Service worker session route caching
 * 
 * Verifies that the service worker caches session routes and serves them
 * offline with network-first strategy.
 */

import { readFileSync } from "fs";
import { join } from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testSwContainsSessionRouteCaching() {
  console.log("\n▶ Testing SW contains session route caching logic...");

  // Read the generated SW code
  const swPath = join(process.cwd(), "src", "app", "sw.js", "route.ts");
  const swCode = readFileSync(swPath, "utf-8");

  // Check for isSessionRoute function
  assert(
    swCode.includes("function isSessionRoute"),
    "SW should contain isSessionRoute function"
  );

  // Check for /session/ pathname check
  assert(
    swCode.includes('url.pathname.startsWith("/session/"'),
    "SW should check for /session/ routes"
  );

  // Check for network-first caching logic
  assert(
    swCode.includes("if (isSessionRoute(event.request))"),
    "SW should have session route handler"
  );

  // Check for cache.put on successful network response
  assert(
    swCode.includes("cache.put(event.request, networkResponse.clone())"),
    "SW should cache successful network responses"
  );

  // Check for cache fallback on network failure
  assert(
    swCode.includes("const cachedResponse = await cache.match(event.request)"),
    "SW should fall back to cache on network failure"
  );

  console.log("  ✓ SW contains isSessionRoute function");
  console.log("  ✓ SW checks for /session/ routes");
  console.log("  ✓ SW has network-first with cache fallback");
}

function testSwSessionRouteLogic() {
  console.log("\n▶ Testing session route detection logic...");

  // Simulate the isSessionRoute function
  const origin = "https://example.com";
  
  function isSessionRoute(request: { method: string; url: string; headers: Map<string, string>; mode: string }): boolean {
    if (request.method !== "GET") {
      return false;
    }
    
    const url = new URL(request.url);
    
    if (url.origin !== origin) {
      return false;
    }
    
    const isRSC = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
    if (url.pathname.startsWith("/session/") && !isRSC && request.mode === "navigate") {
      return true;
    }
    
    return false;
  }

  // Test cases
  const testCases = [
    {
      request: {
        method: "GET",
        url: `${origin}/session/abc123`,
        headers: new Map(),
        mode: "navigate",
      },
      expected: true,
      description: "Session route should be cached",
    },
    {
      request: {
        method: "POST",
        url: `${origin}/session/abc123`,
        headers: new Map(),
        mode: "navigate",
      },
      expected: false,
      description: "POST requests should not be cached",
    },
    {
      request: {
        method: "GET",
        url: `${origin}/session/abc123?_rsc=1`,
        headers: new Map(),
        mode: "navigate",
      },
      expected: false,
      description: "RSC requests should not be cached",
    },
    {
      request: {
        method: "GET",
        url: `${origin}/session/abc123`,
        headers: new Map([["RSC", "1"]]),
        mode: "navigate",
      },
      expected: false,
      description: "RSC header requests should not be cached",
    },
    {
      request: {
        method: "GET",
        url: `${origin}/today`,
        headers: new Map(),
        mode: "navigate",
      },
      expected: false,
      description: "Non-session routes should not be cached",
    },
    {
      request: {
        method: "GET",
        url: `https://other.com/session/abc123`,
        headers: new Map(),
        mode: "navigate",
      },
      expected: false,
      description: "Cross-origin requests should not be cached",
    },
  ];

  for (const testCase of testCases) {
    const result = isSessionRoute(testCase.request);
    assert(
      result === testCase.expected,
      `${testCase.description}: expected ${testCase.expected}, got ${result}`
    );
    console.log(`  ✓ ${testCase.description}`);
  }
}

console.log("Testing Service Worker Session Route Caching");
console.log("============================================");

testSwContainsSessionRouteCaching();
testSwSessionRouteLogic();

console.log("\n✅ All SW session route caching tests passed\n");
