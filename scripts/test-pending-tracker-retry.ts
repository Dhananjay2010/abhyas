#!/usr/bin/env tsx
/**
 * Test PendingTracker behavior: failed save then successful retry lets you finish.
 *
 *   npx tsx scripts/test-pending-tracker-retry.ts
 */

import { PendingTracker } from "../src/lib/session/pending-tracker";

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

async function runTests() {
  console.log("\nTesting PendingTracker failed save then successful retry\n");

  console.log("1. Failed save blocks finish");
  {
    const tracker = new PendingTracker();

    const failedSave = Promise.resolve({ ok: false, error: "Network error" });
    tracker.track("logSet", failedSave);

    await tracker.waitForAll();

    assertEquals(tracker.hasRecentFailures(), true, "Failed save detected");
    assertEquals(tracker.hasPending(), false, "No pending after wait");
  }

  console.log("\n2. Successful retry after failed save lets you finish");
  {
    const tracker = new PendingTracker();

    // First save fails
    const failedSave = Promise.resolve({ ok: false, error: "Network error" });
    tracker.track("logSet", failedSave);
    await tracker.waitForAll();

    assertEquals(tracker.hasRecentFailures(), true, "Failed save detected");

    // User retries - successful this time
    const successfulRetry = Promise.resolve({ ok: true });
    tracker.track("logSet", successfulRetry);
    await tracker.waitForAll();

    assertEquals(tracker.hasRecentFailures(), false, "Successful retry clears failure");
    assertEquals(tracker.hasPending(), false, "No pending after retry");
  }

  console.log("\n3. Multiple failed saves then success");
  {
    const tracker = new PendingTracker();

    // First save fails
    const fail1 = Promise.resolve({ ok: false, error: "Error 1" });
    tracker.track("logSet", fail1);
    await tracker.waitForAll();
    assertEquals(tracker.hasRecentFailures(), true, "First failure detected");

    // Second save also fails
    const fail2 = Promise.resolve({ ok: false, error: "Error 2" });
    tracker.track("logSet", fail2);
    await tracker.waitForAll();
    assertEquals(tracker.hasRecentFailures(), true, "Second failure detected");

    // Third save succeeds
    const success = Promise.resolve({ ok: true });
    tracker.track("logSet", success);
    await tracker.waitForAll();
    assertEquals(tracker.hasRecentFailures(), false, "Success after multiple failures");
  }

  console.log("\n4. clearResults() clears failure state");
  {
    const tracker = new PendingTracker();

    const failedSave = Promise.resolve({ ok: false, error: "Network error" });
    tracker.track("logSet", failedSave);
    await tracker.waitForAll();

    assertEquals(tracker.hasRecentFailures(), true, "Failed save detected");

    tracker.clearResults();

    assertEquals(tracker.hasRecentFailures(), false, "Failure cleared after clearResults");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All PendingTracker retry tests passed!");
}

runTests();
