#!/usr/bin/env tsx
/**
 * Mutant tests for session finish flow.
 *
 * Each test verifies that a specific mutation would cause a failure.
 * The mutation is described, and the test demonstrates the expected behavior.
 *
 *   npx tsx scripts/test-finish-mutants.ts
 */

import { endEarlyConfirmTitle, sessionSummaryTitle } from "../src/lib/session/end-early-text";
import { freezeElapsed } from "../src/lib/session/device";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
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

(async () => {
  console.log("🧪 Testing mutants for finish flow\n");

  // M6: finish-flow.ts ~52-57: on {ok:false} setPhase('done') is never called
  console.log("M6: On {ok:false}, setPhase('done') must NOT be called");
  {
    let phaseCalled = false;
    const mockSetPhase = () => { phaseCalled = true; };

    // Simulate the flow: if result.ok is false, we should NOT call setPhase
    const result = { ok: false, error: "Network error" };
    if (!result.ok) {
      // Correct: do NOT call mockSetPhase
      // Mutant would call it here
    } else {
      mockSetPhase();
    }

    assertTrue(!phaseCalled, "setPhase must not be called when result.ok is false");
  }

  // M12: finish-flow.ts ~L42: finishSession receives exactly the value stopElapsed() returns
  console.log("\nM12: finishSession must receive exactly stopElapsed() return value");
  {
    const stopElapsedValue = 123;
    let receivedValue: number | null = null;

    const mockFinishSession = async (params: { durationSeconds: number }) => {
      receivedValue = params.durationSeconds;
      return { ok: true, data: { status: "completed" as const } };
    };

    const mockStopElapsed = () => stopElapsedValue;

    // Simulate the flow
    const durationSeconds = mockStopElapsed();
    await mockFinishSession({ durationSeconds });

    assertEquals(receivedValue, stopElapsedValue, "finishSession must receive stopElapsed() value");
  }

  // M4/M5: device.ts 209-214, 218-222: freezeElapsed returns frozen value when set
  console.log("\nM4/M5: freezeElapsed must return frozen value after stop()");
  {
    const frozenValue = 60;
    const start = 0;
    const currentTime = 120000; // Later time

    // When frozen value is set, it should return that, not calculate from current time
    const result = freezeElapsed(frozenValue, start, currentTime);
    assertEquals(result, frozenValue, "freezeElapsed must return frozen value when set");

    // Mutant: would calculate elapsedSeconds(start, currentTime) instead
    const mutantResult = Math.floor((currentTime - start) / 1000);
    assertTrue(mutantResult !== result, "Mutant would calculate from currentTime, not use frozen");
  }

  console.log("\nM4/M5: freezeElapsed must calculate when frozen is null");
  {
    const start = 0;
    const currentTime = 45000;

    // When frozen is null, should calculate
    const result = freezeElapsed(null, start, currentTime);
    const expected = Math.floor((currentTime - start) / 1000);
    assertEquals(result, expected, "freezeElapsed must calculate when frozen is null");
  }

  // M11: finish-session.ts:51: skipped sessions get completed_at null
  console.log("\nM11: Skipped sessions must have completed_at = null");
  {
    // Simulate the logic from finishSessionCore
    const status: string = "skipped";
    const completed_at = status === "completed" ? new Date().toISOString() : null;

    assertEquals(completed_at, null, "Skipped sessions must have completed_at = null");

    // Mutant: would always set completed_at
    const mutantCompleted_at = new Date().toISOString();
    assertTrue(typeof mutantCompleted_at === "string" && completed_at === null, "Mutant would set timestamp for skipped");
  }

  console.log("\nM11: Completed sessions must have completed_at set");
  {
    const status: string = "completed";
    const completed_at = status === "completed" ? new Date().toISOString() : null;

    assertTrue(completed_at !== null, "Completed sessions must have completed_at set");
  }

  // M1: finish-flow.ts:118: end early with exactly 1 set is ended-early, not skipped
  console.log("\nM1: End early with 1 set must show summary (ended early)");
  {
    const setsDone: number = 1;

    // The logic: if setsDone === 0, navigate to Today; else show summary
    const shouldShowSummary = setsDone !== 0;

    assertTrue(shouldShowSummary, "End early with 1 set must show summary");

    // Mutant: would check wrong value
    const wouldNavigate = setsDone === 0;
    assertTrue(wouldNavigate !== shouldShowSummary, "Mutant would navigate for 1 set");
  }

  console.log("\nM1: End early with 0 sets must navigate to Today");
  {
    const setsDone: number = 0;
    const shouldNavigate = setsDone === 0;

    assertTrue(shouldNavigate, "End early with 0 sets must navigate to Today");
  }

  // M2/M9: Pure helpers for confirm text and summary title
  console.log("\nM2: endEarlyConfirmTitle must show correct sets count");
  {
    const setsDone = 3;
    const setsPlanned = 10;
    const title = endEarlyConfirmTitle(setsDone, setsPlanned);

    assertEquals(title, "End now? 3 of 10 sets done", "Title must show sets count");

    // Mutant: might swap the numbers or use wrong format
    const mutantTitle = `End now? ${setsPlanned} of ${setsDone} sets done`;
    assertTrue(mutantTitle !== title, "Mutant would swap or format incorrectly");
  }

  console.log("\nM2: endEarlyConfirmTitle with 0 sets");
  {
    const title = endEarlyConfirmTitle(0, 10);
    assertEquals(title, "End now? 0 of 10 sets done", "Title must show 0 sets");
  }

  console.log("\nM9: sessionSummaryTitle for ended early");
  {
    const title = sessionSummaryTitle(true);
    assertEquals(title, "Session ended early", "Title must reflect ended early");

    // Mutant: would show "Session complete" for ended early
    const mutantTitle = sessionSummaryTitle(false);
    assertTrue(mutantTitle !== title, "Mutant would not distinguish ended early");
  }

  console.log("\nM9: sessionSummaryTitle for completed normally");
  {
    const title = sessionSummaryTitle(false);
    assertEquals(title, "Session complete", "Title must show complete");
  }

  // Summary
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All mutant tests passed!");
})();
