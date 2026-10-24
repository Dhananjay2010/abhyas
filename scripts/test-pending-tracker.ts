#!/usr/bin/env tsx
/**
 * Test pending tracker and canFinish logic.
 *
 *   npx tsx scripts/test-pending-tracker.ts
 */

import { PendingTracker, canFinish } from "../src/lib/session/pending-tracker";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\nTesting canFinish helper\n");

  // Test 1: Can finish when no pending saves
  console.log("1. Can finish when no pending saves");
  {
    const result = canFinish({ pendingSaves: 0, failedSaves: false });
    assertEquals(result.can, true, "Can finish with no pending");
    assertEquals(result.reason, null, "No reason given");
  }

  // Test 2: Cannot finish with pending saves
  console.log("\n2. Cannot finish with pending saves");
  {
    const result = canFinish({ pendingSaves: 1, failedSaves: false });
    assertEquals(result.can, false, "Cannot finish with pending");
    assertEquals(result.reason, "Saving your set…", "Shows saving reason");
  }

  // Test 3: Cannot finish with failed saves
  console.log("\n3. Cannot finish with failed saves");
  {
    const result = canFinish({ pendingSaves: 0, failedSaves: true });
    assertEquals(result.can, false, "Cannot finish with failed");
    assertTrue(!!result.reason && result.reason.includes("Couldn't save"), "Shows error reason");
  }

  // Test 4: Failed takes precedence
  console.log("\n4. Failed saves take precedence over pending");
  {
    const result = canFinish({ pendingSaves: 1, failedSaves: true });
    assertEquals(result.can, false, "Cannot finish");
    assertTrue(!!result.reason && result.reason.includes("Couldn't save"), "Shows error not pending");
  }

  console.log("\n\nTesting PendingTracker\n");

  // Test 5: Empty tracker has no pending
  console.log("5. Empty tracker");
  {
    const tracker = new PendingTracker();
    assertEquals(tracker.hasPending(), false, "No pending initially");
    assertEquals(tracker.pendingCount(), 0, "Zero count");
  }

  // Test 6: Track a promise
  console.log("\n6. Track a pending promise");
  {
    const tracker = new PendingTracker();
    const promise = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => resolve({ ok: true }), 10);
    });

    tracker.track("logSet", promise);
    assertEquals(tracker.hasPending(), true, "Has pending after track");
    assertEquals(tracker.pendingCount(), 1, "Count is 1");
  }

  // Test 7: Promise clears after resolution
  console.log("\n7. Promise clears after resolution");
  {
    const tracker = new PendingTracker();
    const promise = Promise.resolve({ ok: true });

    tracker.track("logSet", promise);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assertEquals(tracker.hasPending(), false, "No pending after resolution");
    assertEquals(tracker.pendingCount(), 0, "Count is 0");
  }

  // Test 8: Multiple pending promises
  console.log("\n8. Multiple pending promises");
  {
    const tracker = new PendingTracker();
    const p1 = new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: true }), 50));
    const p2 = new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: true }), 50));

    tracker.track("logSet", p1);
    tracker.track("logSet", p2);

    assertEquals(tracker.pendingCount(), 2, "Two pending");
  }

  // Test 9: waitForAll resolves when all done
  console.log("\n9. waitForAll waits for completion");
  {
    const tracker = new PendingTracker();
    let resolved = false;

    const promise = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve({ ok: true });
      }, 20);
    });

    tracker.track("logSet", promise);
    await tracker.waitForAll();

    assertEquals(resolved, true, "Promise resolved before waitForAll returned");
    assertEquals(tracker.hasPending(), false, "No pending after waitForAll");
  }

  // Test 10: hasRecentFailures detects failed promises
  console.log("\n10. hasRecentFailures detects failures");
  {
    const tracker = new PendingTracker();
    const promise = Promise.resolve({ ok: false, error: "Test error" });

    tracker.track("logSet", promise);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const hasFailed = tracker.hasRecentFailures();
    assertEquals(hasFailed, true, "Detects failed promise");
  }

  // Test 11: hasRecentFailures returns false when all succeed
  console.log("\n11. hasRecentFailures returns false for successful promises");
  {
    const tracker = new PendingTracker();
    tracker.clearResults(); // Clear any previous results
    const promise = Promise.resolve({ ok: true });

    tracker.track("logSet", promise);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const hasFailed = tracker.hasRecentFailures();
    assertEquals(hasFailed, false, "No failures detected");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All pending tracker tests passed!");
}

runTests();
