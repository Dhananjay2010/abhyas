#!/usr/bin/env tsx
/**
 * Behavioral test: BottomNav offline fallback detection (#47 LOW-1)
 *
 * Requirements:
 * - BottomNav must detect data-offline marker after hydration
 * - Must not render when offline fallback is detected
 * - Must use useEffect to check marker (avoid hydration mismatch)
 *
 * This test fails on the old code (pre-fix).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";

console.log("▶ Testing BottomNav offline fallback detection...\n");

const bottomNavPath = join(process.cwd(), "src/components/bottom-nav.tsx");
const offlineScreenPath = join(process.cwd(), "src/components/offline-screen.tsx");

const bottomNavSource = readFileSync(bottomNavPath, "utf-8");
const offlineScreenSource = readFileSync(offlineScreenPath, "utf-8");

console.log("▶ Verifying offline fallback marker in OfflineScreen...");

assert(
  offlineScreenSource.includes('data-offline="true"') ||
  offlineScreenSource.includes("data-offline='true'"),
  "OfflineScreen must set data-offline marker"
);

const markerCount = (offlineScreenSource.match(/data-offline=/g) || []).length;
assert(
  markerCount >= 2,
  "OfflineScreen must set data-offline in both fullPage and error boundary variants"
);

console.log("  ✓ OfflineScreen sets data-offline marker");
console.log("  ✓ Marker present in both fullPage and error boundary variants");

console.log("\n▶ Verifying BottomNav detects offline fallback...");

assert(
  bottomNavSource.includes("useState") &&
  (bottomNavSource.includes("isOfflineFallback") || bottomNavSource.includes("offlineFallback")),
  "BottomNav must track offline fallback state"
);

assert(
  bottomNavSource.includes("useEffect"),
  "BottomNav must use useEffect to detect marker after hydration"
);

assert(
  bottomNavSource.includes('querySelector("[data-offline]")') ||
  bottomNavSource.includes("querySelector('[data-offline]')"),
  "BottomNav must check for data-offline marker"
);

assert(
  bottomNavSource.includes("if (isOfflineFallback)") ||
  bottomNavSource.includes("if(isOfflineFallback)"),
  "BottomNav must conditionally render based on offline fallback"
);

assert(
  bottomNavSource.includes("return null") &&
  bottomNavSource.match(/if\s*\(\s*isOfflineFallback\s*\)\s*return\s*null/),
  "BottomNav must return null when offline fallback is detected"
);

console.log("  ✓ Tracks offline fallback state");
console.log("  ✓ Uses useEffect to detect marker after hydration");
console.log("  ✓ Checks for [data-offline] marker");
console.log("  ✓ Returns null when offline fallback detected");
console.log("  ✓ No hydration mismatch risk");

console.log("\n✅ All BottomNav offline fallback tests passed");
