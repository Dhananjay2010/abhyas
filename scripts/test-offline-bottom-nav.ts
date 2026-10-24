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

  // Must have data-offline="true" attribute
  assert(
    source.includes('data-offline="true"'),
    'Offline page must have data-offline="true" attribute'
  );

  console.log('  ✓ Offline page has data-offline="true" marker');
}

function testBottomNavHiding() {
  console.log("\n▶ Testing bottom nav offline hiding via CSS...");

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

  // Must NOT have useLayoutEffect or useState for offline detection
  // (should use CSS instead)
  assert(
    !source.includes('isOffline') && !source.includes('setIsOffline'),
    "BottomNav must NOT use useState for offline detection (should use CSS hiding)"
  );

  console.log("  ✓ BottomNav has data-bottom-nav attribute");
  console.log("  ✓ BottomNav uses CSS hiding (no useState for isOffline)");

  // Check globals.css for the hiding rule
  console.log("\n▶ Testing globals.css for offline hiding rule...");
  
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
  console.log("  ✓ CSS rule sets display: none");
}

console.log("Testing Offline Page Bottom Nav Hiding");
console.log("======================================");

testOfflinePageMarker();
testBottomNavHiding();

console.log("\n✅ All offline bottom nav hiding tests passed\n");
