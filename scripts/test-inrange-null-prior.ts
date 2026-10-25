#!/usr/bin/env tsx
/**
 * Test: In-range hold with no prior stored weight (null)
 * 
 * Stored: null
 * Logged: 4×10 @ various weights (all in 8-12 range)
 * Expected: Store the heaviest logged weight (H2 fallback, unchanged behavior)
 * 
 * Run: npm run test:inrange-null-prior
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const state = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: null,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: null,
  bestE1rm: null,
  totalSessions: 0,
  ...over,
});

console.log("\nTest: In-range hold with null prior (new user)\n");

console.log("1. New user, 4×10 @ 40 kg");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 40 },
      { reps: 10, weightKg: 40 },
      { reps: 10, weightKg: 40 },
      { reps: 10, weightKg: 40 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 40 kg (H2: heaviest logged)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Failures: 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n2. New user, mixed weights (35, 40, 37.5, 40)");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 35 },
      { reps: 10, weightKg: 40 },
      { reps: 10, weightKg: 37.5 },
      { reps: 10, weightKg: 40 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: 40 kg (H2: heaviest)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Failures: 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n3. Bodyweight (null) stays null");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: { ...BENCH, isBodyweight: true },
    state: state(),
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: null (bodyweight)", decision.nextWorkingWeightKg === null, `${decision.nextWorkingWeightKg}`);
  check("Failures: 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
