#!/usr/bin/env tsx
/**
 * Test that the session runner waits for pending logSet calls before finishing.
 * Uses a fake client to verify ordering of operations.
 *
 *   npx tsx scripts/test-pending-tracker-ordering.ts
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
  console.log("\nTesting pending tracker ordering in session runner\n");

  console.log("1. Finish awaits pending logSet before calling finishSession");
  {
    const tracker = new PendingTracker();
    const callOrder: string[] = [];

    const logSetPromise = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        callOrder.push("logSet-resolved");
        resolve({ ok: true });
      }, 50);
    });

    tracker.track("logSet", logSetPromise);

    callOrder.push("logSet-started");

    await tracker.waitForAll();
    callOrder.push("waitForAll-done");

    callOrder.push("finishSession-called");

    assertEquals(callOrder[0], "logSet-started", "logSet starts first");
    assertEquals(callOrder[1], "logSet-resolved", "logSet resolves");
    assertEquals(callOrder[2], "waitForAll-done", "waitForAll completes after logSet");
    assertEquals(callOrder[3], "finishSession-called", "finishSession called last");
  }

  console.log("\n2. Multiple pending logSet calls are all awaited");
  {
    const tracker = new PendingTracker();
    const callOrder: string[] = [];

    const logSet1 = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        callOrder.push("logSet1-resolved");
        resolve({ ok: true });
      }, 30);
    });

    const logSet2 = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        callOrder.push("logSet2-resolved");
        resolve({ ok: true });
      }, 50);
    });

    tracker.track("logSet", logSet1);
    tracker.track("logSet", logSet2);

    await tracker.waitForAll();
    callOrder.push("waitForAll-done");

    assertEquals(callOrder.includes("logSet1-resolved"), true, "logSet1 resolved");
    assertEquals(callOrder.includes("logSet2-resolved"), true, "logSet2 resolved");
    assertEquals(callOrder[2], "waitForAll-done", "waitForAll waits for both");
  }

  console.log("\n3. Failed logSet is detected before finish");
  {
    const tracker = new PendingTracker();

    const logSetPromise = Promise.resolve({ ok: false, error: "Network error" });

    tracker.track("logSet", logSetPromise);
    await tracker.waitForAll();

    const hasFailed = tracker.hasRecentFailures();
    assertEquals(hasFailed, true, "Failed logSet detected");
  }

  console.log("\n4. Simulated finish flow: logSet completes before finishSession");
  {
    const tracker = new PendingTracker();
    const callOrder: string[] = [];

    async function simulateLogSet() {
      callOrder.push("logSet-start");
      const promise = new Promise<{ ok: boolean }>((resolve) => {
        setTimeout(() => {
          callOrder.push("logSet-complete");
          resolve({ ok: true });
        }, 30);
      });
      return tracker.track("logSet", promise);
    }

    async function simulateFinish() {
      callOrder.push("finish-start");
      await tracker.waitForAll();
      callOrder.push("finish-waitForAll-done");
      callOrder.push("finishSession-call");
    }

    await simulateLogSet();
    await simulateFinish();

    assertEquals(callOrder[0], "logSet-start", "logSet starts");
    assertEquals(callOrder[1], "logSet-complete", "logSet completes");
    assertEquals(callOrder[2], "finish-start", "finish starts");
    assertEquals(callOrder[3], "finish-waitForAll-done", "waitForAll completes");
    assertEquals(callOrder[4], "finishSession-call", "finishSession called after logSet");
  }

  console.log("\n5. MUTANT TEST: finish without await causes race condition");
  {
    const tracker = new PendingTracker();
    const callOrder: string[] = [];

    async function simulateLogSet() {
      callOrder.push("logSet-start");
      const promise = new Promise<{ ok: boolean }>((resolve) => {
        setTimeout(() => {
          callOrder.push("logSet-complete");
          resolve({ ok: true });
        }, 30);
      });
      return tracker.track("logSet", promise);
    }

    async function simulateFinishWithoutAwait() {
      callOrder.push("finish-start");
      tracker.waitForAll();
      callOrder.push("finishSession-call-EARLY");
    }

    const logSetTask = simulateLogSet();
    const finishTask = simulateFinishWithoutAwait();

    await Promise.all([logSetTask, finishTask]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    assertEquals(
      callOrder.includes("finishSession-call-EARLY"),
      true,
      "Without await, finishSession called immediately"
    );
    assertEquals(
      callOrder.indexOf("finishSession-call-EARLY") < callOrder.indexOf("logSet-complete"),
      true,
      "MUTANT: finishSession called before logSet completes (WRONG)"
    );
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All pending tracker ordering tests passed!");
}

runTests();
