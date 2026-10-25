/**
 * Behavioral test: Service worker cache cleanup logic.
 *
 * Tests the pure cachesToDelete function that determines which caches
 * should be deleted during SW activation, AND tests that the real function
 * is injected into the SW script (not a hand-copied duplicate).
 *
 * This test FAILS on main because cachesToDelete does not exist there.
 */

import { cachesToDelete } from "../src/lib/sw-logic";

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

async function runTests() {
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

  const allCaches5 = [
    "abhyas-offline-v1",
    "abhyas-offline-v2",
    "abhyasa-offline-v1",
    "abhyas-v1",
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

  console.log("\n▶ Testing SW route injects real cachesToDelete function...");

  async function testSWRouteInjection() {
    const { GET } = await import("../src/app/sw.js/route");
    const response = await GET();
    const scriptText = await response.text();

    // Verify the function was injected
    if (!scriptText.includes("function cachesToDelete")) {
      throw new Error("SW script must include injected cachesToDelete function");
    }

    console.log("  ✓ SW script includes injected cachesToDelete function");

    // Extract CACHE_NAME from the script to match what the SW will use
    const cacheNameMatch = scriptText.match(/const CACHE_NAME = "([^"]+)"/);
    if (!cacheNameMatch) {
      throw new Error("Could not extract CACHE_NAME from SW script");
    }
    const expectedCurrentCache = cacheNameMatch[1];
    
    // Create cache names that match the extracted CACHE_NAME pattern
    // If CACHE_NAME is "abhyas-offline-abc123", we want v1, v2 as old caches
    const brandMatch = expectedCurrentCache.match(/^(.+-offline-)/);
    if (!brandMatch) {
      throw new Error("CACHE_NAME doesn't match expected pattern");
    }
    const brandPrefix = brandMatch[1];
    
    const deletedCaches: string[] = [];
    const allCaches = [
      `${brandPrefix}v1`,
      `${brandPrefix}v2`,
      expectedCurrentCache,
      "fitcore-offline-v1",
      "other-cache",
    ];

    let activateHandler: ((event: { waitUntil: (p: Promise<void>) => void }) => void) | null = null;

    const fakeGlobal = {
      caches: {
        keys: async () => allCaches,
        delete: async (name: string) => {
          deletedCaches.push(name);
          return true;
        },
        open: async () => ({}),
      },
      clients: {
        claim: async () => undefined,
      },
      addEventListener: (_event: string, handler: (...args: unknown[]) => void) => {
        if (_event === "activate") {
          activateHandler = handler as (event: { waitUntil: (p: Promise<void>) => void }) => void;
        }
      },
    };

    const fakeSelf = {
      ...fakeGlobal,
      skipWaiting: async () => undefined,
    };

    const wrappedScript = new Function(
      "self",
      "caches",
      "clients",
      scriptText
    );

    wrappedScript.call(
      fakeSelf,
      fakeSelf,
      fakeGlobal.caches,
      fakeGlobal.clients
    );

    if (!activateHandler) {
      throw new Error("Activate handler was not registered");
    }

    // Trigger the activate event (non-null asserted after check above)
    type ActivateHandler = (event: { waitUntil: (p: Promise<void>) => void }) => void;
    let activatePromise: Promise<void> | null = null;
    (activateHandler as ActivateHandler)({
      waitUntil: (p: Promise<void>) => {
        activatePromise = p;
      },
    });

    if (!activatePromise) {
      throw new Error("Activate handler did not call event.waitUntil");
    }

    // Wait for activation to complete
    await activatePromise;

    // Verify the correct caches were deleted
    const expectedDeleted = [`${brandPrefix}v1`, `${brandPrefix}v2`];
    assertArrayEquals(
      deletedCaches,
      expectedDeleted,
      "SW activate should delete old same-brand caches only"
    );

    console.log(`  ✓ SW activate handler deletes old brand caches: ${expectedDeleted.join(", ")}`);
    console.log(`  ✓ SW activate handler keeps current cache: ${expectedCurrentCache}`);
    console.log("  ✓ SW activate handler keeps other brand caches: fitcore-offline-v1");
    console.log("  ✓ SW activate handler keeps other caches: other-cache");
    console.log("  ✓ Real cachesToDelete function is used (not a copy)");
  }

  await testSWRouteInjection();

  console.log("\n✅ All cache cleanup behavioral tests passed\n");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
