#!/usr/bin/env tsx
/**
 * Test that pendingTracker.waitForAll() actually waits for in-flight operations.
 *
 * This test ensures that if a set is still being saved (async operation not yet
 * resolved), the pending tracker will wait for it to complete before allowing
 * finish() to proceed.
 *
 *   npx tsx scripts/test-pending-set-await.ts
 */

import { PendingTracker } from "../src/lib/session/pending-tracker";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("\nTesting pendingTracker awaits in-flight operations\n");

  console.log("1. waitForAll() waits for pending async operation");
  {
    const tracker = new PendingTracker();
    let operationCompleted = false;

    // Start an async operation that takes 50ms
    const slowOperation = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        operationCompleted = true;
        resolve({ ok: true });
      }, 50);
    });

    tracker.track("logSet", slowOperation);

    assertTrue(tracker.hasPending(), "Should have pending operation before wait");
    assertTrue(!operationCompleted, "Operation should not be completed yet");

    // Wait for all pending operations
    await tracker.waitForAll();

    assertTrue(operationCompleted, "Operation should be completed after waitForAll");
    assertTrue(!tracker.hasPending(), "Should have no pending operations after wait");
  }

  console.log("\n2. Tracker has pending operations after tracking");
  {
    const tracker = new PendingTracker();

    const op1 = Promise.resolve({ ok: true });
    const op2 = Promise.resolve({ ok: false });

    tracker.track("logSet", op1);
    tracker.track("finishExercise", op2);

    assertTrue(tracker.hasPending(), "Should have pending operations");

    await tracker.waitForAll();

    assertTrue(!tracker.hasPending(), "Should have no pending after waitForAll");
  }

  console.log("\n3. Multiple sequential operations");
  {
    const tracker = new PendingTracker();
    const completionOrder: number[] = [];

    const op1 = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        completionOrder.push(1);
        resolve({ ok: true });
      }, 30);
    });

    const op2 = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        completionOrder.push(2);
        resolve({ ok: true });
      }, 10);
    });

    tracker.track("logSet", op1);
    tracker.track("finishExercise", op2);

    await tracker.waitForAll();

    assertTrue(completionOrder.length === 2, "Both operations should complete");
    assertTrue(completionOrder.includes(1) && completionOrder.includes(2), "Both ops should be in completion order");
  }

  console.log("\n4. waitForAll() on empty tracker returns immediately");
  {
    const tracker = new PendingTracker();

    const startTime = Date.now();
    await tracker.waitForAll();
    const elapsed = Date.now() - startTime;

    assertTrue(elapsed < 10, "Should return immediately", `Took ${elapsed}ms`);
  }

  console.log("\n5. Already-resolved promise is still tracked");
  {
    const tracker = new PendingTracker();
    const resolved = Promise.resolve({ ok: true });

    tracker.track("logSet", resolved);

    assertTrue(tracker.hasPending(), "Should track even resolved promises");

    await tracker.waitForAll();

    assertTrue(!tracker.hasPending(), "Should clear after wait");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All pending-set await tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
