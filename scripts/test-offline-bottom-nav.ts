/**
 * Test: Offline page bottom nav hiding
 *
 * Verifies that the bottom nav is hidden on the offline page
 * via the data-offline attribute marker.
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testOfflinePageMarker() {
  console.log("\n▶ Testing offline page data-offline marker...");

  const offlinePagePath = path.join(__dirname, "..", "src", "app", "offline", "page.tsx");
  
  assert(
    fs.existsSync(offlinePagePath),
    "src/app/offline/page.tsx must exist"
  );

  const source = fs.readFileSync(offlinePagePath, "utf-8");

  // Must use OfflineScreen component which includes data-offline="true"
  assert(
    source.includes('OfflineScreen'),
    'Offline page must use OfflineScreen component (which sets data-offline="true")'
  );

  // Verify OfflineScreen component has data-offline="true"
  const offlineScreenPath = path.join(__dirname, "..", "src", "components", "offline-screen.tsx");
  const offlineScreenSource = fs.readFileSync(offlineScreenPath, "utf-8");
  
  assert(
    offlineScreenSource.includes('data-offline="true"'),
    'OfflineScreen component must have data-offline="true" attribute'
  );

  console.log('  ✓ Offline page uses OfflineScreen component');
  console.log('  ✓ OfflineScreen has data-offline="true" marker');
}

function testBottomNavHiding() {
  console.log("\n▶ Testing bottom nav offline hiding mechanism...");

  const bottomNavPath = path.join(__dirname, "..", "src", "components", "bottom-nav.tsx");
  
  assert(
    fs.existsSync(bottomNavPath),
    "src/components/bottom-nav.tsx must exist"
  );

  const source = fs.readFileSync(bottomNavPath, "utf-8");

  // Must have data-bottom-nav attribute on nav element
  assert(
    source.includes('data-bottom-nav'),
    "BottomNav <nav> element must have data-bottom-nav attribute"
  );

  // Must use the offline error context (not local state)
  assert(
    source.includes('useOfflineError'),
    "BottomNav must use useOfflineError hook from context"
  );

  assert(
    source.includes('isOfflineError'),
    "BottomNav must check isOfflineError from context"
  );

  assert(
    source.includes('if (isOfflineError) return null') || source.includes('if(isOfflineError)return null'),
    "BottomNav must return null when isOfflineError is true"
  );

  console.log("  ✓ BottomNav has data-bottom-nav attribute");
  console.log("  ✓ BottomNav uses useOfflineError hook");
  console.log("  ✓ BottomNav checks isOfflineError from context");
  console.log("  ✓ BottomNav returns null when offline");

  // Check globals.css for the hiding rule (as a fallback when CSS is cached)
  console.log("\n▶ Testing globals.css for offline hiding rule (CSS fallback)...");
  
  const globalsCssPath = path.join(__dirname, "..", "src", "app", "globals.css");
  
  assert(
    fs.existsSync(globalsCssPath),
    "src/app/globals.css must exist"
  );

  const cssSource = fs.readFileSync(globalsCssPath, "utf-8");

  // Must have CSS rule to hide bottom-nav when offline page is present
  assert(
    cssSource.includes('body:has([data-offline])') && cssSource.includes('[data-bottom-nav]'),
    "globals.css must have CSS rule: body:has([data-offline]) [data-bottom-nav]"
  );

  assert(
    cssSource.includes('display: none'),
    "CSS hiding rule must set display: none"
  );

  console.log("  ✓ globals.css has body:has([data-offline]) [data-bottom-nav] rule");
  console.log("  ✓ CSS rule sets display: none (as fallback when CSS is cached)");
}

console.log("Testing Offline Page Bottom Nav Hiding");
console.log("======================================");

testOfflinePageMarker();
testBottomNavHiding();

console.log("\n✅ All offline bottom nav hiding tests passed\n");
