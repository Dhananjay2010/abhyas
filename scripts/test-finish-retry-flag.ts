#!/usr/bin/env tsx
/**
 * Test that 'Try again' shows after every failed save in session runner.
 *
 * Item 8: The stale-closure bug at session-runner ~:338 meant error !== null
 * read the error from the render before runFinish called setError, so the
 * first finish failure never showed "Try again".
 *
 *   npx tsx scripts/test-finish-retry-flag.ts
 */

import { runFinish, shouldShowFinishRetry } from "../src/lib/session/finish-flow";
import type { FinishFlowDeps } from "../src/lib/session/finish-flow";

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
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function runTests() {
  console.log("\n1. runFinish returns false on first failure");
  {
    let errorMessage: string | null = null;
    const deps: FinishFlowDeps = {
      finishSession: async () => ({ ok: false, error: "Database error" }),
      abandonSession: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      stopElapsed: () => 1800,
      resumeElapsed: () => {},
      setError: (msg) => { errorMessage = msg; },
      setPhase: () => {},
      setEndedEarly: () => {},
      navigate: () => {},
      onExit: null,
      inFlight: { current: false },
    };

    const succeeded = await runFinish(deps, {
      sessionId: "s1",
      cooldownCompleted: false,
    });

    assertEquals(succeeded, false, "runFinish should return false on failure");
    assertTrue(errorMessage !== null && typeof errorMessage === "string", "Error message should be set");
    assertTrue(errorMessage!.includes("Try again"), "Error should mention Try again");
  }

  console.log("\n2. runFinish returns true on success");
  {
    let phase: string | null = null;
    const deps: FinishFlowDeps = {
      finishSession: async () => ({ ok: true, data: { status: "completed" as const } }),
      abandonSession: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      stopElapsed: () => 1800,
      resumeElapsed: () => {},
      setError: () => {},
      setPhase: (p) => { phase = p; },
      setEndedEarly: () => {},
      navigate: () => {},
      onExit: null,
      inFlight: { current: false },
    };

    const succeeded = await runFinish(deps, {
      sessionId: "s1",
      cooldownCompleted: true,
    });

    assertEquals(succeeded, true, "runFinish should return true on success");
    assertEquals(phase, "done", "Phase should be set to done");
  }

  console.log("\n3. runFinish returns false on network error");
  {
    let errorMessage: string | null = null;
    const deps: FinishFlowDeps = {
      finishSession: async () => {
        const err = new Error("Failed to fetch");
        err.name = "TypeError";
        throw err;
      },
      abandonSession: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      stopElapsed: () => 1800,
      resumeElapsed: () => {},
      setError: (msg) => { errorMessage = msg; },
      setPhase: () => {},
      setEndedEarly: () => {},
      navigate: () => {},
      onExit: null,
      inFlight: { current: false },
    };

    const succeeded = await runFinish(deps, {
      sessionId: "s1",
      cooldownCompleted: false,
    });

    assertEquals(succeeded, false, "runFinish should return false on network error");
    assertTrue(errorMessage !== null && typeof errorMessage === "string", "Error message should be set");
    assertTrue(errorMessage!.includes("offline"), "Error should mention offline");
  }

  console.log("\n4. runFinish returns false when already in flight");
  {
    const deps: FinishFlowDeps = {
      finishSession: async () => ({ ok: true, data: { status: "completed" as const } }),
      abandonSession: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      stopElapsed: () => 1800,
      resumeElapsed: () => {},
      setError: () => {},
      setPhase: () => {},
      setEndedEarly: () => {},
      navigate: () => {},
      onExit: null,
      inFlight: { current: true }, // Already in flight
    };

    const succeeded = await runFinish(deps, {
      sessionId: "s1",
      cooldownCompleted: false,
    });

    assertEquals(succeeded, false, "runFinish should return false when already in flight");
  }

  console.log("\n5. shouldShowFinishRetry returns true after failure without cooldown");
  {
    const succeeded = false;
    const cooldownCompleted = false;

    const result = shouldShowFinishRetry(succeeded, cooldownCompleted);

    assertEquals(result, true, "shouldShowFinishRetry should return true after failure without cooldown");
  }

  console.log("\n6. shouldShowFinishRetry returns false on cooldown path");
  {
    const succeeded = false;
    const cooldownCompleted = true;

    const result = shouldShowFinishRetry(succeeded, cooldownCompleted);

    assertEquals(result, false, "shouldShowFinishRetry should return false on cooldown path");
  }

  console.log("\n7. shouldShowFinishRetry returns false on success");
  {
    const succeeded = true;
    const cooldownCompleted = false;

    const result = shouldShowFinishRetry(succeeded, cooldownCompleted);

    assertEquals(result, false, "shouldShowFinishRetry should return false on success");
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
