/**
 * Behavioral test: Service worker cache cleanup logic.
 *
 * Tests the pure cachesToDelete function that determines which caches
 * should be deleted during SW activation.
 *
 * This test FAILS on main because cachesToDelete does not exist there.
 */

import { cachesToDelete } from "../src/lib/sw-logic";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function assertArrayEquals(actual: string[], expected: string[], message: string): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  
  if (actualSorted.length !== expectedSorted.length) {
    throw new Error(
      `❌ ${message}\n  Expected: ${JSON.stringify(expectedSorted)}\n  Got: ${JSON.stringify(actualSorted)}`
    );
  }
  
  for (let i = 0; i < actualSorted.length; i++) {
    if (actualSorted[i] !== expectedSorted[i]) {
      throw new Error(
        `❌ ${message}\n  Expected: ${JSON.stringify(expectedSorted)}\n  Got: ${JSON.stringify(actualSorted)}`
      );
    }
  }
}

console.log("Testing Service Worker Cache Cleanup Behavior");
console.log("============================================\n");

console.log("▶ Testing cachesToDelete with single brand...");

const allCaches1 = [
  "abhyas-offline-v1",
  "abhyas-offline-v2",
  "abhyas-offline-v3",
  "other-cache",
];

const toDelete1 = cachesToDelete(
  allCaches1,
  "abhyas-offline-v3",
  "abhyas-offline-"
);

assertArrayEquals(
  toDelete1,
  ["abhyas-offline-v1", "abhyas-offline-v2"],
  "Should delete old abhyas caches but not current or other caches"
);

console.log("  ✓ Deletes old versions: abhyas-offline-v1, abhyas-offline-v2");
console.log("  ✓ Keeps current version: abhyas-offline-v3");
console.log("  ✓ Keeps other caches: other-cache");

console.log("\n▶ Testing cachesToDelete with multiple brands...");

const allCaches2 = [
  "abhyas-offline-abc123",
  "abhyas-offline-def456",
  "fitcore-offline-abc123",
  "fitcore-offline-xyz789",
  "other-random-cache",
];

const toDelete2 = cachesToDelete(
  allCaches2,
  "abhyas-offline-def456",
  "abhyas-offline-"
);

assertArrayEquals(
  toDelete2,
  ["abhyas-offline-abc123"],
  "Should only delete old abhyas caches, not fitcore or other caches"
);

console.log("  ✓ Deletes old abhyas cache: abhyas-offline-abc123");
console.log("  ✓ Keeps current abhyas cache: abhyas-offline-def456");
console.log("  ✓ Keeps other brand caches: fitcore-offline-abc123, fitcore-offline-xyz789");
console.log("  ✓ Keeps other caches: other-random-cache");

console.log("\n▶ Testing cachesToDelete with no old caches...");

const allCaches3 = [
  "abhyas-offline-v1",
  "fitcore-offline-v1",
];

const toDelete3 = cachesToDelete(
  allCaches3,
  "abhyas-offline-v1",
  "abhyas-offline-"
);

assertArrayEquals(
  toDelete3,
  [],
  "Should delete nothing when current is the only cache for this brand"
);

console.log("  ✓ No old caches to delete");
console.log("  ✓ Keeps current cache: abhyas-offline-v1");
console.log("  ✓ Keeps other brand caches: fitcore-offline-v1");

console.log("\n▶ Testing cachesToDelete with empty cache list...");

const toDelete4 = cachesToDelete(
  [],
  "abhyas-offline-v1",
  "abhyas-offline-"
);

assertArrayEquals(
  toDelete4,
  [],
  "Should handle empty cache list gracefully"
);

console.log("  ✓ Returns empty array for empty input");

console.log("\n▶ Testing cachesToDelete brand isolation...");

// Ensure that brands with similar prefixes don't interfere
const allCaches5 = [
  "abhyas-offline-v1",
  "abhyas-offline-v2",
  "abhyasa-offline-v1", // Similar prefix but different brand
  "abhyas-v1", // Doesn't match prefix pattern
];

const toDelete5 = cachesToDelete(
  allCaches5,
  "abhyas-offline-v2",
  "abhyas-offline-"
);

assertArrayEquals(
  toDelete5,
  ["abhyas-offline-v1"],
  "Should only match exact prefix, not similar prefixes"
);

console.log("  ✓ Only deletes exact prefix matches");
console.log("  ✓ Does not match similar prefixes: abhyasa-offline-v1");
console.log("  ✓ Does not match partial prefixes: abhyas-v1");

console.log("\n✅ All cache cleanup behavioral tests passed\n");
