#!/usr/bin/env tsx
/**
 * UNIT TEST: QA Bot 1 Must-Cover (7) - Timed holds progression logic
 * 
 * Unit test of evaluateProgression() proving that 40s holds with a stored 45s target
 * do not progress, across 3 consecutive sessions, then 45s progresses.
 * 
 * NOTE: This is a UNIT TEST directly calling evaluateProgression().
 * The FULL PATH test (through writeExerciseProgressCore + ProgressClient) is in
 * test-qa-bot-1-full-path.ts, which tests the complete integration.
 * 
 * Must-covers (2) and (3) are also in test-qa-bot-1-full-path.ts.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, passed: boolean, detail?: string): void {
  if (!passed) {
    console.error(`❌ FAIL: ${desc}${detail ? ` -- got ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ok   ${desc}${detail ? ` -- ${detail}` : ""}`);
  }
}

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: null,
  currentTargetReps: null,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: null,
  bestE1rm: null,
  totalSessions: 0,
  ...over,
});

const PLANK: ExerciseMeta = {
  mechanic: "isolation",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== QA Bot 1 Must-Cover (7): Timed Holds Only Progress When Reaching Target ===\n");

// Stored target is 45s. User holds 40s every session.
// Should NOT progress because 40 < 45 (resolveTarget(...).max)
{
  let state = fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 });
  
  // Session 1: 3x40s
  const s1 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 1: 3x40s with stored 45s → does NOT progress", s1.outcome !== "progressed");
  check("Session 1: target stays at 45s", s1.nextTargetReps === 45);
  
  // Update state
  state = {
    ...state,
    currentTargetReps: s1.nextTargetReps,
    consecutiveFailures: s1.consecutiveFailures,
  };
  
  // Session 2: 3x40s again
  const s2 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 2: 3x40s with stored 45s → still does NOT progress", s2.outcome !== "progressed");
  check("Session 2: target still at 45s", s2.nextTargetReps === 45);
  
  // Update state
  state = {
    ...state,
    currentTargetReps: s2.nextTargetReps,
    consecutiveFailures: s2.consecutiveFailures,
  };
  
  // Session 3: 3x40s again
  const s3 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 3: 3x40s with stored 45s → STILL does NOT progress", s3.outcome !== "progressed");
  check("Session 3: target STILL at 45s (never rose)", s3.nextTargetReps === 45);
}

// Now test that 45s DOES succeed and progress
{
  const state = fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 });
  
  const result = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 45, weightKg: 0 },
      { reps: null, durationSeconds: 45, weightKg: 0 },
      { reps: null, durationSeconds: 45, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("3x45s with stored 45s → DOES progress", result.outcome === "progressed");
  check("3x45s → target rises to 50s", result.nextTargetReps === 50, `${result.nextTargetReps}`);
}


console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL QA BOT 1 MUST-COVER TESTS PASSED\n");
