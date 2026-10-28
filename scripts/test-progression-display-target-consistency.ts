#!/usr/bin/env tsx
/**
 * Test: Progression success check uses the same target the display shows.
 * 
 * Verifies that evaluateProgression judges sets against resolveTarget's .max,
 * covering:
 * - Pull-ups (pull-up bar, not loadable) stored 14: target 14
 * - Dips (dip bars, not loadable) stored: target stored
 * - Push-ups (no equipment) stored 14 and 26: targets 14 and 26
 * - Plank stored 45s and 500s: targets 45s and 120s (capped)
 * - Weighted plank (weight > 0): plan range
 * - Stored below plan min: plan range
 * - Stored 0: plan range
 * - Loaded barbell reps: plan range
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
    totalSessions: 0, weightAtFailureStartKg: null,
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

const PULLUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_pull",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const DIP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_press",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== Progression Success Check = Display Target ===\n");

// Case 1: Pull-ups (pull-up bar, not loadable) stored 14
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  const equipmentIds = ["pull_up_bar"];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: null,
  });
  
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
    equipmentIds,
    meta: PULLUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Pull-ups (pull-up bar) stored 14: display shows ${displayTarget.max}`, displayTarget.max === stored);
  check(`Pull-ups: 3x${displayTarget.max} succeeds`, successResult.outcome === "progressed");
}

// Case 2: Dips (dip bars, not loadable) stored value
{
  const stored = 18;
  const plannedMin = 10;
  const plannedMax = 15;
  const equipmentIds = ["dip_bars"];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: null,
  });
  
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
    equipmentIds,
    meta: DIP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Dips (dip bars) stored ${stored}: display shows ${displayTarget.max}`, displayTarget.max === stored);
  check(`Dips: 3x${displayTarget.max} succeeds`, successResult.outcome === "progressed");
}

// Case 3: Push-ups (no equipment) stored 14
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: null,
  });
  
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
    equipmentIds,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Push-ups stored 14: display shows ${displayTarget.max}`, displayTarget.max === stored);
  check(`Push-ups: 3x${displayTarget.max} succeeds`, successResult.outcome === "progressed");
}

// Case 4: Push-ups stored 26
{
  const stored = 26;
  const plannedMin = 8;
  const plannedMax = 12;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: null,
  });
  
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
    equipmentIds,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Push-ups stored 26: display shows ${displayTarget.max} (capped at 2×plan)`, displayTarget.max === 2 * plannedMax);
  check(`Push-ups: 3x${displayTarget.max} succeeds`, successResult.outcome === "progressed");
}

// Case 5: Plank stored 45s
{
  const stored = 45;
  const plannedMin = 20;
  const plannedMax = 40;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
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
    equipmentIds,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Plank stored 45s: display shows ${displayTarget.max}s`, displayTarget.max === stored);
  check(`Plank: 3x${displayTarget.max}s succeeds`, successResult.outcome === "progressed");
}

// Case 6: Plank stored 500s (capped at 120s)
{
  const stored = 500;
  const plannedMin = 20;
  const plannedMax = 40;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
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
    equipmentIds,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Plank stored 500s: display capped at 120s`, displayTarget.max === 120);
  check(`Plank: 3x120s holds (ceiling reached)`, successResult.outcome === "hold" && successResult.nextTargetReps === 120);
}

// Case 7: Weighted plank (weight > 0, uses plan range)
{
  const stored = 60;
  const plannedMin = 20;
  const plannedMax = 40;
  const workingWeight = 10;
  const equipmentIds = ["weight_plate"];
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
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
    equipmentIds,
    
    meta: WEIGHTED_PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: workingWeight }),
    isDeload: false,
  });
  
  check(`Weighted plank: display uses plan max ${displayTarget.max}s (ignores stored ${stored}s)`, displayTarget.max === plannedMax);
  check(`Weighted plank: 3x${plannedMax}s at ${workingWeight}kg succeeds`, successResult.outcome === "progressed");
}

// Case 7b: Weighted pull-ups (non-loadable equipment + weight > 0 = loaded)
{
  const stored = 20;
  const plannedMin = 8;
  const plannedMax = 12;
  const workingWeight = 10;
  const equipmentIds = ["pull_up_bar"];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: workingWeight,
  });
  
  // Test at plan max: correct code expects 12 (plan), mutant would expect 20 (stored)
  // So 3x12 should succeed with correct code but fail with mutant
  const atPlanMaxResult = evaluateProgression({
    sets: [
      { reps: plannedMax, weightKg: workingWeight },
      { reps: plannedMax, weightKg: workingWeight },
      { reps: plannedMax, weightKg: workingWeight },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds,
    
    meta: PULLUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: workingWeight }),
    isDeload: false,
  });
  
  check(`Weighted pull-ups (pull-up bar + 10kg): display uses plan max ${displayTarget.max} (ignores stored ${stored})`, displayTarget.max === plannedMax);
  check(`Weighted pull-ups: 3x${plannedMax} @ ${workingWeight}kg succeeds (M10 pin: weight != null matters)`, atPlanMaxResult.outcome === "progressed");
}

// Case 8: Stored below plan min (falls back to plan range)
{
  const stored = 5;
  const plannedMin = 8;
  const plannedMax = 12;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
    currentWorkingWeightKg: null,
  });
  
  const successResult = evaluateProgression({
    sets: [
      { reps: plannedMax, weightKg: 0 },
      { reps: plannedMax, weightKg: 0 },
      { reps: plannedMax, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: plannedMin,
    repsMax: plannedMax,
    feel: "right",
    equipmentIds,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Stored ${stored} below plan min: display uses plan max ${displayTarget.max}`, displayTarget.max === plannedMax);
  check(`Stored below min: 3x${plannedMax} succeeds`, successResult.outcome === "progressed");
}

// Case 9: Stored 0 (falls back to plan range)
{
  const stored = 0;
  const plannedMin = 20;
  const plannedMax = 40;
  const equipmentIds: string[] = [];
  
  const displayTarget = resolveTarget({
    metric: "seconds",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
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
    equipmentIds,
    meta: PLANK,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check(`Stored 0: display uses plan max ${displayTarget.max}s`, displayTarget.max === plannedMax);
  check(`Stored 0: 3x${plannedMax}s succeeds`, successResult.outcome === "progressed");
}

// Case 10: Loaded barbell reps (plan used)
{
  const stored = 14;
  const plannedMin = 8;
  const plannedMax = 12;
  const workingWeight = 60;
  const equipmentIds = ["barbell"];
  
  const displayTarget = resolveTarget({
    metric: "reps",
    plannedMin,
    plannedMax,
    currentTargetReps: stored,
    equipmentIds,
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
    equipmentIds,
    
    meta: BENCH,
    state: fresh({ currentTargetReps: stored, currentWorkingWeightKg: workingWeight }),
    isDeload: false,
  });
  
  check(`Loaded barbell reps: display uses plan max ${displayTarget.max} (ignores stored ${stored})`, displayTarget.max === plannedMax);
  check(`Loaded barbell: 3x${plannedMax} at ${workingWeight}kg succeeds`, successResult.outcome === "progressed");
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL CHECKS PASSED: Success check = display target\n");
