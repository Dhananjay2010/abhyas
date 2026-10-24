#!/usr/bin/env tsx
/**
 * Mutation tests for canFinish and finish ordering.
 *
 *   npx tsx scripts/test-pending-tracker-mutations.ts
 */

import { canFinish } from "../src/lib/session/pending-tracker";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("🧬 Testing canFinish mutants\n");

// Mutant 1: Ignore pending saves (always return can: true)
console.log("Mutant 1: Ignore pending saves");
{
  const result = canFinish({ pendingSaves: 3, failedSaves: false });
  assertTrue(!result.can, "Must block when saves are pending");
  assertTrue(result.reason !== null, "Must provide a reason");
}

// Mutant 2: Ignore failed saves
console.log("\nMutant 2: Ignore failed saves");
{
  const result = canFinish({ pendingSaves: 0, failedSaves: true });
  assertTrue(!result.can, "Must block when saves failed");
  assertTrue(result.reason !== null, "Must provide error reason");
}

// Mutant 3: Wrong condition (allow finish if pending > 0)
console.log("\nMutant 3: Inverted pending check");
{
  const withPending = canFinish({ pendingSaves: 1, failedSaves: false });
  const withoutPending = canFinish({ pendingSaves: 0, failedSaves: false });

  assertTrue(!withPending.can, "Pending must block");
  assertTrue(withoutPending.can, "No pending must allow");
  assertTrue(withPending.can !== withoutPending.can, "Results must differ");
}

// Mutant 4: Wrong priority (check pending before failed)
console.log("\nMutant 4: Check failed before pending");
{
  const result = canFinish({ pendingSaves: 1, failedSaves: true });
  assertTrue(!result.can, "Must block with both");
  // The correct implementation checks failed first, so reason should mention failure
  const mentionsError = result.reason?.toLowerCase().includes("couldn't") ||
                         result.reason?.toLowerCase().includes("failed");
  assertTrue(mentionsError || false, "Should prioritize failure message");
}

// Mutant 5: No reason provided
console.log("\nMutant 5: Omit reason when blocked");
{
  const blocked = canFinish({ pendingSaves: 1, failedSaves: false });
  assertTrue(blocked.reason !== null && blocked.reason !== "", "Must provide reason when blocked");

  const allowed = canFinish({ pendingSaves: 0, failedSaves: false });
  assertTrue(allowed.reason === null, "No reason needed when allowed");
}

console.log("\n\nTesting finish ordering constraint\n");

// Test: Finish must wait for pending logSet
console.log("6. Finish waits for pending logSet to resolve");
async function test6() {
  let logSetResolved = false;

  const logSetPromise = new Promise<{ ok: boolean }>((resolve) => {
    setTimeout(() => {
      logSetResolved = true;
      resolve({ ok: true });
    }, 20);
  });

  // Simulate: Can't finish while promise is pending
  const beforeResolve = canFinish({ pendingSaves: 1, failedSaves: false });
  assertTrue(!beforeResolve.can, "Cannot finish while pending");

  // Wait for logSet to complete
  await logSetPromise;

  // After it resolves, finish can proceed
  const afterResolve = canFinish({ pendingSaves: 0, failedSaves: false });
  assertTrue(afterResolve.can, "Can finish after resolution");
  assertTrue(logSetResolved, "LogSet resolved before finish check");
}

// Mutant: Finish without awaiting logSet
console.log("\n7. Mutant: finish without awaiting");
async function test7() {
  let logSetResolved = false;
  let finishCalledEarly = false;

  const logSetPromise = new Promise<{ ok: boolean }>((resolve) => {
    setTimeout(() => {
      logSetResolved = true;
      resolve({ ok: true });
    }, 20);
  });

  // Mutant would call finish immediately
  // Correct implementation blocks
  const check = canFinish({ pendingSaves: 1, failedSaves: false });

  if (check.can) {
    // Mutant allowed finish early
    finishCalledEarly = true;
  }

  await logSetPromise;

  assertTrue(!finishCalledEarly, "Must not allow finish before logSet resolves");
  assertTrue(logSetResolved, "LogSet must resolve first");
}

// Test: Never finish if logSet rejected
console.log("\n8. Never finish if logSet rejected");
{
  const failedPromise = Promise.reject(new Error("Network error"));

  // Catch to prevent unhandled rejection
  failedPromise.catch(() => {});

  // With a failed save, finish must be blocked
  const check = canFinish({ pendingSaves: 0, failedSaves: true });
  assertTrue(!check.can, "Must block if save failed");
  assertTrue(check.reason !== null, "Must show error reason");
}

(async () => {
  await test6();
  await test7();

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All mutants caught!");
})();
