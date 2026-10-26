#!/usr/bin/env tsx
/**
 * Test: Verify unchanged progression paths
 * 
 * The in-range fix should ONLY affect in-range holds.
 * These paths should remain unchanged:
 * - Top-of-range increase
 * - Miss
 * - Deload
 * - Bodyweight progression
 * 
 * Run: npm run test:inrange-unchanged-paths
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

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: "pushup_chain",
  progressionRank: 1,
};

const state = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 12,
  bestE1rm: 56,
  totalSessions: 1,
  ...over,
});

console.log("\nTest: Unchanged progression paths\n");

console.log("1. Top-of-range: all sets at repsMax → increase");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
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

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 42.5 kg (increased)", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n2. Miss: below repsMin → hold with failures++");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
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
  check("Next weight: 37.5 kg (first-miss drop)", decision.nextWorkingWeightKg === 37.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: 1", decision.consecutiveFailures === 1, `${decision.consecutiveFailures}`);
}

console.log("\n3. Two-miss deload: failures=1 + miss → backed_off");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
      { reps: 7, weightKg: 40 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: state({ consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: backed_off", decision.outcome === "backed_off", decision.outcome);
  check("Next weight: 35 kg (~10% deload)", decision.nextWorkingWeightKg === 35, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n4. Deload week: weight unchanged regardless of performance");
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
    isDeload: true,
    equipmentIds: ["barbell"],
    unit: "kg",
  });

  check("Outcome: deload_week", decision.outcome === "deload_week", decision.outcome);
  check("Next weight: 40 kg (unchanged)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Failures: 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n5. Bodyweight in-range: stays null");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
      { reps: 10, weightKg: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: {
      currentWorkingWeightKg: null,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: 10,
      bestE1rm: null,
      totalSessions: 1,
    },
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Next weight: null (bodyweight)", decision.nextWorkingWeightKg === null, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n6. Bodyweight at top: reps increase");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: null },
      { reps: 12, weightKg: null },
      { reps: 12, weightKg: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: {
      currentWorkingWeightKg: null,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 1,
    },
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });

  check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next target: 14 reps (+2)", decision.nextTargetReps === 14, `${decision.nextTargetReps}`);
  check("Next weight: null", decision.nextWorkingWeightKg === null, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
