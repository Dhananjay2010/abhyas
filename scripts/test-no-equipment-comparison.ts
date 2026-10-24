#!/usr/bin/env tsx
/**
 * Test: Verify no regression for users with no equipment info
 * 
 * Compares progression outputs with and without equipment info to ensure
 * users with no equipment data are not worse off than before the fix.
 */

import {
  evaluateProgression,
  suggestedWeight,
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

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

console.log("\n1. Success progression: no equipment vs with equipment");
{
  const noEquip = evaluateProgression({
    sets: sets(4, 12),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
  });
  
  const withEquip = evaluateProgression({
    sets: sets(4, 12),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("no equipment: 60 -> 62.5", noEquip.nextWorkingWeightKg === 62.5, `got ${noEquip.nextWorkingWeightKg}`);
  check("with equipment: 60 -> 62.5", withEquip.nextWorkingWeightKg === 62.5, `got ${withEquip.nextWorkingWeightKg}`);
  check("outcomes match", noEquip.outcome === withEquip.outcome);
}

console.log("\n2. First miss: no equipment vs with equipment");
{
  const noEquip = evaluateProgression({
    sets: sets(4, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
  });
  
  const withEquip = evaluateProgression({
    sets: sets(4, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("no equipment: holds at 60", noEquip.nextWorkingWeightKg === 60, `got ${noEquip.nextWorkingWeightKg}`);
  check("with equipment: drops to 57.5", withEquip.nextWorkingWeightKg === 57.5, `got ${withEquip.nextWorkingWeightKg}`);
  check("no equipment outcome is hold", noEquip.outcome === "hold");
  check("no equipment is NOT worse (holds vs drops)", noEquip.nextWorkingWeightKg! >= withEquip.nextWorkingWeightKg!);
}

console.log("\n3. Two-miss back-off: no equipment vs with equipment");
{
  const noEquip = evaluateProgression({
    sets: sets(4, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ consecutiveFailures: 1 }),
    isDeload: false,
  });
  
  const withEquip = evaluateProgression({
    sets: sets(4, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("no equipment: 60 -> 52.5", noEquip.nextWorkingWeightKg === 52.5, `got ${noEquip.nextWorkingWeightKg}`);
  check("with equipment: 60 -> 52.5", withEquip.nextWorkingWeightKg === 52.5, `got ${withEquip.nextWorkingWeightKg}`);
  check("outcomes match", noEquip.outcome === withEquip.outcome);
}

console.log("\n4. Isolation back-off: no equipment vs with equipment");
{
  const noEquip = evaluateProgression({
    sets: sets(4, 10, 15),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 15, consecutiveFailures: 1 }),
    isDeload: false,
  });
  
  const withEquip = evaluateProgression({
    sets: sets(4, 10, 15),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 15, consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  
  check("no equipment: 15 -> 12.5", noEquip.nextWorkingWeightKg === 12.5, `got ${noEquip.nextWorkingWeightKg}`);
  check("with equipment: 15 -> 12.5", withEquip.nextWorkingWeightKg === 12.5, `got ${withEquip.nextWorkingWeightKg}`);
  check("outcomes match", noEquip.outcome === withEquip.outcome);
}

console.log("\n5. Deload suggestion: no equipment vs with equipment");
{
  const noEquip = suggestedWeight({ currentWorkingWeightKg: 60 }, true, BENCH);
  const withEquip = suggestedWeight({ currentWorkingWeightKg: 60 }, true, BENCH, ["barbell"], "kg");
  
  check("no equipment deload: 60 -> ~42", noEquip === 42.5, `got ${noEquip}`);
  check("with equipment deload: 60 -> ~42", withEquip === 42.5, `got ${withEquip}`);
}

console.log("\n--- SUMMARY ---");
if (failures > 0) {
  console.log(`FAILED: ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED - No regression for users without equipment info");
  process.exit(0);
}
