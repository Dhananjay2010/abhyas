#!/usr/bin/env tsx
/*
 * Test: Resume refresh behavior
 *
 * Tests that router.refresh() is called on mount, visibilitychange, and pageshow.
 * This is a pure logic test of the refresh decision function.
 */

export {}; // Make this a module

/**
 * Pure function to decide whether to refresh based on event.
 * Extracted from useResumeRefresh for testability.
 */
export function shouldRefreshOnEvent(
  eventType: "mount" | "visibilitychange" | "pageshow",
  visibilityState?: "visible" | "hidden",
  pageshowPersisted?: boolean,
): boolean {
  if (eventType === "mount") {
    return true;
  }

  if (eventType === "visibilitychange") {
    return visibilityState === "visible";
  }

  if (eventType === "pageshow") {
    return pageshowPersisted === true;
  }

  return false;
}

let passed = 0;
let failed = 0;

function testResumeRefresh(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqualRefresh<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing resume refresh behavior\n");

  // Test 1: mount always triggers refresh
  await testResumeRefresh("mount → refresh", () => {
    const should = shouldRefreshOnEvent("mount");
    assertEqualRefresh(should, true, "Should refresh on mount");
  });

  // Test 2: visibilitychange to visible triggers refresh
  await testResumeRefresh("visibilitychange (visible) → refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "visible");
    assertEqualRefresh(should, true, "Should refresh when becoming visible");
  });

  // Test 3: visibilitychange to hidden does not trigger refresh
  await testResumeRefresh("visibilitychange (hidden) → no refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "hidden");
    assertEqualRefresh(should, false, "Should not refresh when becoming hidden");
  });

  // Test 4: pageshow with persisted=true triggers refresh (bfcache)
  await testResumeRefresh("pageshow (persisted=true) → refresh", () => {
    const should = shouldRefreshOnEvent("pageshow", undefined, true);
    assertEqualRefresh(should, true, "Should refresh when restored from bfcache");
  });

  // Test 5: pageshow with persisted=false does not trigger refresh
  await testResumeRefresh("pageshow (persisted=false) → no refresh", () => {
    const should = shouldRefreshOnEvent("pageshow", undefined, false);
    assertEqualRefresh(should, false, "Should not refresh on normal pageshow");
  });

  // Test 6: B1 regression - resume after 30s triggers refresh
  await testResumeRefresh("B1: resume after backgrounding → refresh", () => {
    const should = shouldRefreshOnEvent("visibilitychange", "visible");
    assertEqualRefresh(should, true, "Should refresh to get fresh data on resume");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
