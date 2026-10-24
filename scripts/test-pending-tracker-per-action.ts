#!/usr/bin/env tsx
/**
 * Test that PendingTracker correctly tracks the latest result per action,
 * not just a single global latestResult.
 *
 * Regression test for regression #1: if we store only one latestResult instead
 * of tracking per-action, an older action resolving after a newer one could
 * incorrectly overwrite the newer result.
 *
 *   npx tsx scripts/test-pending-tracker-per-action.ts
 */

import { PendingTracker } from "../src/lib/session/pending-tracker";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failed++;
    console.error(`❌ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    passed++;
    console.log(`  ok   ${label}`);
  }
}

async function testOlderActionResolvingAfterNewer() {
  console.log("\n1. Older action failing BEFORE newer succeeds: failure must be detected");

  const tracker = new PendingTracker();

  // Track two actions of different types
  let resolveLogSet: (value: { ok: boolean }) => void;
  let resolveFinishExercise: (value: { ok: boolean; error?: string }) => void;

  const logSetPromise = new Promise<{ ok: boolean }>((resolve) => {
    resolveLogSet = resolve;
  });

  const finishExercisePromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    resolveFinishExercise = resolve;
  });

  // Start both actions
  tracker.track("logSet", logSetPromise);
  tracker.track("finishExercise", finishExercisePromise);

  check("Both actions are pending", tracker.pendingCount() === 2);

  // Resolve the older logSet action with a failure FIRST
  resolveLogSet!({ ok: false });
  await Promise.resolve(); // Let microtask run

  // Then resolve the newer finishExercise action successfully
  resolveFinishExercise!({ ok: true });
  await Promise.resolve(); // Let microtask run

  await tracker.waitForAll();

  // The logSet failure should still be detected even though finishExercise
  // succeeded after it. With single latestResult, the success would hide the failure.
  check(
    "hasRecentFailures detects the logSet failure even though finishExercise succeeded later",
    tracker.hasRecentFailures(),
    "logSet failed, should be detected despite later success"
  );
}

async function testSequentialActionsOfSameType() {
  console.log("\n2. Sequential actions of the same type: latest result wins");

  const tracker = new PendingTracker();

  // First action succeeds
  const promise1 = Promise.resolve({ ok: true });
  tracker.track("logSet", promise1);
  await tracker.waitForAll();

  check("First action succeeded, no failures", !tracker.hasRecentFailures());

  // Second action fails
  const promise2 = Promise.resolve({ ok: false, error: "Network error" });
  tracker.track("logSet", promise2);
  await tracker.waitForAll();

  check("Second action failed, hasRecentFailures is true", tracker.hasRecentFailures());

  // Third action succeeds again
  const promise3 = Promise.resolve({ ok: true });
  tracker.track("logSet", promise3);
  await tracker.waitForAll();

  check("Third action succeeded, hasRecentFailures is false", !tracker.hasRecentFailures());
}

async function testMultipleActionTypesIndependentFailures() {
  console.log("\n3. Multiple action types track failures independently");

  const tracker = new PendingTracker();

  // logSet succeeds
  const logSetPromise = Promise.resolve({ ok: true });
  tracker.track("logSet", logSetPromise);

  // finishExercise fails
  const finishPromise = Promise.resolve({ ok: false, error: "Failed" });
  tracker.track("finishExercise", finishPromise);

  await tracker.waitForAll();

  // If we track per-action, we should detect the finishExercise failure
  check(
    "Failure in one action type is detected",
    tracker.hasRecentFailures(),
    "finishExercise failed even though logSet succeeded"
  );
}

(async () => {
  console.log("🧪 Testing PendingTracker per-action result tracking\n");

  await testOlderActionResolvingAfterNewer();
  await testSequentialActionsOfSameType();
  await testMultipleActionTypesIndependentFailures();

  console.log(`\n${failed === 0 ? "✅" : "❌"} Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
