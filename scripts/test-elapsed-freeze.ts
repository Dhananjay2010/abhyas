#!/usr/bin/env tsx
/**
 * Test f1 and f2: useElapsed stop() freezes the timer, and finish sends the frozen value.
 *
 *   npx tsx scripts/test-elapsed-freeze.ts
 */

import { runFinish, runEndEarly } from "../src/lib/session/finish-flow";
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
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("\nTesting useElapsed freeze and finish sending frozen value\n");

// Test 1: stopElapsed is called and returns a frozen value
console.log("1. stopElapsed is called once and returns frozen value");
{
  let stopCount = 0;
  let resumeCount = 0;
  let finishDuration: number | null = null;

  const deps: FinishFlowDeps = {
    stopElapsed() {
      stopCount++;
      return 1234;
    },
    resumeElapsed() {
      resumeCount++;
    },
    async finishSession(params) {
      finishDuration = params.durationSeconds;
      return { ok: true, data: { status: "completed" } };
    },
    async abandonSession() {
      return { ok: true };
    },
    async refreshAfterSession() {
      return { ok: true };
    },
    setError() {},
    setPhase() {},
    setEndedEarly() {},
    navigate() {},
    onExit: null,
    inFlight: { current: false },
  };

  (async () => {
    const success = await runFinish(deps, {
      sessionId: "s1",
      cooldownCompleted: true,
    });

    assertTrue(success, "runFinish succeeds");
    assertEquals(stopCount, 1, "stopElapsed called once");
    assertEquals(resumeCount, 0, "resumeElapsed not called on success");
    assertEquals(finishDuration, 1234, "finishSession receives frozen duration from stopElapsed");
  })();
}

// Test 2: stopElapsed is called on abandon flow
console.log("\n2. stopElapsed is called on abandon (end early)");
{
  let stopCount = 0;
  let abandonDuration: number | null = null;

  const deps = {
    stopElapsed() {
      stopCount++;
      return 5678;
    },
    resumeElapsed() {},
    async abandonSession(sessionId: string, durationSeconds: number) {
      abandonDuration = durationSeconds;
      return { ok: true };
    },
    async refreshAfterSession() {
      return { ok: true };
    },
    setError() {},
    setPhase() {},
    setEndedEarly() {},
    navigate() {},
    onExit: null,
    inFlight: { current: false },
  };

  (async () => {
    await runEndEarly(deps, {
      sessionId: "s2",
      setsDone: 2,
      setConfirming() {},
      setOfflineError() {},
      endingRef: { current: false },
      setEnding() {},
    });

    assertEquals(stopCount, 1, "stopElapsed called once");
    assertEquals(abandonDuration, 5678, "abandonSession receives frozen duration from stopElapsed");
  })();
}

// Test 3: resumeElapsed is called on failure
console.log("\n3. resumeElapsed is called when finish fails");
{
  let stopCount = 0;
  let resumeCount = 0;

  const deps: FinishFlowDeps = {
    stopElapsed() {
      stopCount++;
      return 999;
    },
    resumeElapsed() {
      resumeCount++;
    },
    async finishSession() {
      return { ok: false, error: "Network error" };
    },
    async abandonSession() {
      return { ok: true };
    },
    async refreshAfterSession() {
      return { ok: true };
    },
    setError() {},
    setPhase() {},
    setEndedEarly() {},
    navigate() {},
    onExit: null,
    inFlight: { current: false },
  };

  (async () => {
    const success = await runFinish(deps, {
      sessionId: "s3",
      cooldownCompleted: false,
    });

    assertEquals(success, false, "runFinish returns false on error");
    assertEquals(stopCount, 1, "stopElapsed called once");
    assertEquals(resumeCount, 1, "resumeElapsed called once on failure");
  })();
}

// Test 4: resumeElapsed is called when abandon fails
console.log("\n4. resumeElapsed is called when abandon fails");
{
  let resumeCount = 0;

  const deps = {
    stopElapsed() {
      return 111;
    },
    resumeElapsed() {
      resumeCount++;
    },
    async abandonSession() {
      return { ok: false, error: "Database error" };
    },
    async refreshAfterSession() {
      return { ok: true };
    },
    setError() {},
    setPhase() {},
    setEndedEarly() {},
    navigate() {},
    onExit: null,
    inFlight: { current: false },
  };

  (async () => {
    await runEndEarly(deps, {
      sessionId: "s4",
      setsDone: 0,
      setConfirming() {},
      setOfflineError() {},
      endingRef: { current: false },
      setEnding() {},
    });

    assertEquals(resumeCount, 1, "resumeElapsed called once on abandon failure");
  })();
}

// Give async tests time to complete
setTimeout(() => {
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All elapsed-freeze tests passed!");
}, 100);
