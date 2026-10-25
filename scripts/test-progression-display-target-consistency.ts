#!/usr/bin/env tsx
/**
 * Test: Progression success check uses the same target the display shows.
 * 
 * Verifies that evaluateProgression judges sets against resolveTarget's .max,
 * covering:
 * - Bodyweight reps (stored 14 vs plan 8-12)
 * - Timed hold (stored 45s, stored 0, stored 200s → capped at 120)
 * - Weighted hold (stored ignored, plan used)
 * - Loaded reps (plan used)
 * - QA case: push-ups stored at 14 are judged against what the display shows
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression.js";
import { resolveTarget } from "../src/lib/session/display-target.js";

let failures = 0;

function check(desc: string, passed: boolean): void {
  if (!passed) {
    console.error(`❌ FAIL: ${desc}`);
    failures++;
  } else {
    console.log(`  ok   ${desc}`);
  }
}

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    currentWorkingWeightKg: null,
    currentTargetReps: null,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: null,
    bestE1rm: null,
    totalSessions: 0,
    ...overrides,
  };
}

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const PLANK: ExerciseMeta = {
  mechanic: "isolation",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const WEIGHTED_PLANK: ExerciseMeta = {
  mechanic: "isolation",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== Progression Success Check = Display Target ===\n");

// Case 1: Bodyweight reps (stored 14 vs plan 8-12)
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: null,
  });
  
  // Success at display target
  const successResult = evaluateProgression({
    sets: [
      { reps: displayTarget.max, weightKg: 0 },
      { reps: displayTarget.max, weightKg: 0 },
      { reps: displayTarget.max, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  // Just below display target
  const failResult = evaluateProgression({
    sets: [
      { reps: displayTarget.max - 1, weightKg: 0 },
      { reps: displayTarget.max - 1, weightKg: 0 },
      { reps: displayTarget.max - 1, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Bodyweight reps: display target is ${displayTarget.max}`, displayTarget.max === stored);
  check(`Bodyweight reps: 3x${displayTarget.max} succeeds`, successResult.outcome === "progressed");
  check(`Bodyweight reps: 3x${displayTarget.max - 1} does not succeed`, failResult.outcome === "hold");
}

// Case 2: Timed hold stored 45s
{
  const stored = 45;
  const plannedMin = 20;
  const plannedMax = 40;
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: null,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Timed hold 45s: display target is ${displayTarget.max}s`, displayTarget.max === stored);
  check(`Timed hold 45s: 3x${displayTarget.max}s succeeds`, successResult.outcome === "progressed");
}

// Case 3: Timed hold stored 0 (treated as absent)
{
  const stored = 0;
  const plannedMin = 20;
  const plannedMax = 40;
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: null,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: plannedMax, weightKg: 0 },
      { reps: null, durationSeconds: plannedMax, weightKg: 0 },
      { reps: null, durationSeconds: plannedMax, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Timed hold stored 0: display falls back to plan max ${displayTarget.max}s`, displayTarget.max === plannedMax);
  check(`Timed hold stored 0: 3x${plannedMax}s succeeds`, successResult.outcome === "progressed");
}

// Case 4: Timed hold stored 200s (capped at 120s)
{
  const stored = 200;
  const plannedMin = 20;
  const plannedMax = 40;
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: null,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
      { reps: null, durationSeconds: displayTarget.max, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Timed hold stored 200s: display capped at 120s`, displayTarget.max === 120);
  check(`Timed hold stored 200s: 3x120s holds (ceiling reached)`, successResult.outcome === "hold" && successResult.nextTargetReps === 120);
}

// Case 5: Weighted hold (stored ignored, plan used)
{
  const stored = 45;
  const plannedMin = 20;
  const plannedMax = 40;
  const workingWeight = 10;
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: workingWeight,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: plannedMax, weightKg: workingWeight },
      { reps: null, durationSeconds: plannedMax, weightKg: workingWeight },
      { reps: null, durationSeconds: plannedMax, weightKg: workingWeight },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: WEIGHTED_PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: workingWeight }),
    isDeload: false,
  });
  
  check(`Weighted hold: display uses plan max ${displayTarget.max}s (ignores stored ${stored}s)`, displayTarget.max === plannedMax);
  check(`Weighted hold: 3x${plannedMax}s at ${workingWeight}kg succeeds`, successResult.outcome === "progressed");
}

// Case 6: Loaded reps (plan used)
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  const workingWeight = 60;
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: false,
    currentWorkingWeightKg: workingWeight,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: plannedMax, weightKg: workingWeight },
      { reps: plannedMax, weightKg: workingWeight },
      { reps: plannedMax, weightKg: workingWeight },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: workingWeight }),
    isDeload: false,
  });
  
  check(`Loaded reps: display uses plan max ${displayTarget.max} (ignores stored ${stored})`, displayTarget.max === plannedMax);
  check(`Loaded reps: 3x${plannedMax} at ${workingWeight}kg succeeds`, successResult.outcome === "progressed");
}

// QA case: Push-ups stored at 14 are judged against what the display shows
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    isBodyweight: true,
    currentWorkingWeightKg: null,
  });
  
  const at14Result = evaluateProgression({
    sets: [
      { reps: 14, weightKg: 0 },
      { reps: 14, weightKg: 0 },
      { reps: 14, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  const at13Result = evaluateProgression({
    sets: [
      { reps: 13, weightKg: 0 },
      { reps: 13, weightKg: 0 },
      { reps: 13, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`QA: Push-ups stored 14, display shows ${displayTarget.max}`, displayTarget.max === 14);
  check(`QA: Push-ups 3x14 succeeds (matches display)`, at14Result.outcome === "progressed");
  check(`QA: Push-ups 3x13 does not succeed (below display)`, at13Result.outcome === "hold");
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL CHECKS PASSED: Success check = display target\n");
