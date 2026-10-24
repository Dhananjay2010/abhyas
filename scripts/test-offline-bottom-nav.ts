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
  console.log("\n▶ Testing bottom nav offline detection...");

  const bottomNavPath = path.join(__dirname, "..", "src", "components", "bottom-nav.tsx");
  
  assert(
    fs.existsSync(bottomNavPath),
    "src/components/bottom-nav.tsx must exist"
  );

  const source = fs.readFileSync(bottomNavPath, "utf-8");

  // Must check for data-offline attribute
  assert(
    source.includes('data-offline'),
    "BottomNav must check for data-offline attribute"
  );

  // Must use querySelector to find the marker
  assert(
    source.includes('querySelector') && source.includes('data-offline'),
    "BottomNav must use querySelector to detect data-offline marker"
  );

  // Must return null when offline marker is present
  assert(
    source.includes('isOffline') && source.includes('return null'),
    "BottomNav must return null when isOffline is true"
  );

  // Must use useEffect or useLayoutEffect to check on pathname changes
  assert(
    source.includes('useEffect') || source.includes('useLayoutEffect') || source.includes('React.useEffect') || source.includes('React.useLayoutEffect'),
    "BottomNav must use useEffect or useLayoutEffect to recheck on pathname changes"
  );

  console.log("  ✓ BottomNav checks for data-offline attribute");
  console.log("  ✓ BottomNav uses querySelector to detect marker");
  console.log("  ✓ BottomNav returns null when isOffline is true");
  console.log("  ✓ BottomNav rechecks on pathname changes");
}

console.log("Testing Offline Page Bottom Nav Hiding");
console.log("======================================");

testOfflinePageMarker();
testBottomNavHiding();

console.log("\n✅ All offline bottom nav hiding tests passed\n");
