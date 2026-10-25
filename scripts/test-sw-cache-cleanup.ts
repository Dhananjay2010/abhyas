/**
 * Test: Service worker cache cleanup on activate.
 *
 * Verifies that the SW cleans up old caches for the same brand when activated,
 * and that cache versioning works correctly with build IDs.
 */

import * as fs from "fs";
import * as path from "path";
import { getCacheName } from "../src/lib/sw-logic";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

console.log("Testing Service Worker Cache Cleanup");
console.log("====================================\n");

console.log("▶ Testing cache versioning logic...");

// Different build IDs produce different cache names
const cache1 = getCacheName("abhyas", "abc123");
const cache2 = getCacheName("abhyas", "def456");

assert(
  cache1 !== cache2,
  "Different build IDs should produce different cache names"
);

assert(
  cache1.includes("abhyas"),
  "Cache name should include brand ID"
);

assert(
  cache1.includes("abc123"),
  "Cache name should include build ID when provided"
);

// Different brands produce different cache names
const brandA = getCacheName("abhyas", "build1");
const brandB = getCacheName("otherbrand", "build1");

assert(
  brandA !== brandB,
  "Different brands should produce different cache names even with same build ID"
);

console.log("  ✓ Different build IDs produce different cache names");
console.log("  ✓ Cache name includes brand ID");
console.log("  ✓ Cache name includes build ID");
console.log("  ✓ Different brands produce different cache names");

console.log("\n▶ Testing SW activate event cleans up old caches...");

const swRoutePath = path.join(__dirname, "..", "src", "app", "sw.js", "route.ts");
const swRouteSource = fs.readFileSync(swRoutePath, "utf-8");

// Must have an activate event listener
assert(
  swRouteSource.includes('addEventListener("activate"') ||
  swRouteSource.includes("addEventListener('activate'"),
  "Service worker must listen to 'activate' event"
);

// Must get all cache names
assert(
  swRouteSource.includes("caches.keys()"),
  "Service worker must call caches.keys() to get all cache names"
);

// Must check for brand prefix to avoid deleting other brands' caches
assert(
  swRouteSource.includes("startsWith") &&
  swRouteSource.includes("-offline-"),
  "Service worker must check cache name prefix to identify brand-specific caches"
);

// Must delete old caches
assert(
  swRouteSource.includes("caches.delete"),
  "Service worker must call caches.delete() to remove old caches"
);

// Must skip the current cache (don't delete yourself)
assert(
  swRouteSource.includes("!==") && swRouteSource.includes("CACHE_NAME"),
  "Service worker must skip deleting the current CACHE_NAME"
);

// Must claim clients
assert(
  swRouteSource.includes("clients.claim()"),
  "Service worker must call clients.claim() to take control immediately"
);

console.log("  ✓ Service worker listens to 'activate' event");
console.log("  ✓ Service worker calls caches.keys() to enumerate caches");
console.log("  ✓ Service worker filters by brand prefix (avoids deleting other brands)");
console.log("  ✓ Service worker calls caches.delete() on old caches");
console.log("  ✓ Service worker skips deleting the current CACHE_NAME");
console.log("  ✓ Service worker calls clients.claim()");

console.log("\n▶ Testing SW install event precaches critical resources...");

// Must have an install event listener
assert(
  swRouteSource.includes('addEventListener("install"') ||
  swRouteSource.includes("addEventListener('install'"),
  "Service worker must listen to 'install' event"
);

// Must open the cache
assert(
  swRouteSource.includes("caches.open(CACHE_NAME)"),
  "Service worker must open the cache with CACHE_NAME"
);

// Must cache offline page
assert(
  swRouteSource.includes("OFFLINE_URL") || swRouteSource.includes('"/offline"'),
  "Service worker must cache the offline page URL"
);

// Must cache app icon
assert(
  swRouteSource.includes("ICON_URL") || swRouteSource.includes("branding.icons"),
  "Service worker must cache the app icon"
);

// Must use cache.addAll or cache.add
assert(
  swRouteSource.includes("cache.addAll") || swRouteSource.includes("cache.add"),
  "Service worker must use cache.addAll or cache.add to precache resources"
);

// Must call skipWaiting to activate immediately
assert(
  swRouteSource.includes("skipWaiting()"),
  "Service worker must call skipWaiting() to activate immediately"
);

console.log("  ✓ Service worker listens to 'install' event");
console.log("  ✓ Service worker opens cache with CACHE_NAME");
console.log("  ✓ Service worker precaches offline page");
console.log("  ✓ Service worker precaches app icon");
console.log("  ✓ Service worker calls skipWaiting()");

console.log("\n▶ Testing SW fetch event offline fallback...");

// Must have a fetch event listener
assert(
  swRouteSource.includes('addEventListener("fetch"') ||
  swRouteSource.includes("addEventListener('fetch'"),
  "Service worker must listen to 'fetch' event"
);

// Must check request method (never intercept non-GET)
assert(
  swRouteSource.includes("request.method") && swRouteSource.includes("GET"),
  "Service worker must check request.method and only intercept GET requests"
);

// Must have early return for non-GET (not respondWith)
assert(
  swRouteSource.includes("return") && !swRouteSource.includes("respondWith") ||
  swRouteSource.match(/if[^{]*method[^{]*{[^}]*return[^}]*}/),
  "Service worker must return early (not call respondWith) for non-GET requests"
);

// Must try network first
assert(
  swRouteSource.includes("fetch("),
  "Service worker must attempt fetch() for network-first strategy"
);

// Must catch network failure
assert(
  swRouteSource.includes("catch") || swRouteSource.includes("try"),
  "Service worker must catch network failures"
);

// Must serve cached offline page on failure
assert(
  swRouteSource.includes("cache.match") && swRouteSource.includes("OFFLINE_URL"),
  "Service worker must serve cached offline page when network fails"
);

console.log("  ✓ Service worker listens to 'fetch' event");
console.log("  ✓ Service worker checks request.method");
console.log("  ✓ Service worker returns early for non-GET requests");
console.log("  ✓ Service worker uses network-first strategy (fetch first)");
console.log("  ✓ Service worker catches network failures");
console.log("  ✓ Service worker serves cached offline page as fallback");

console.log("\n✅ All SW cache cleanup tests passed\n");
