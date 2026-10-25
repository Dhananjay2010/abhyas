/**
 * MEDIUM-4: Pin unloaded exercise target resolution rules.
 * 
 * Tests that applySwapTarget treats weight null and weight 0 as unloaded,
 * uses stored current_target_reps for unloaded exercises, and applies caps:
 * - Reps: capped at 2× plannedRepsMax
 * - Timed holds: capped at 120s
 */

import { applySwapTarget, type SessionExerciseWithTarget } from "@/lib/session/apply-swap-target";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

// Barbell (loadable equipment)
const BARBELL_IDS = ["barbell"] as const;

// Bodyweight (no loadable equipment)
const BODYWEIGHT_IDS: readonly string[] = [];

// Pull-up bar (not loadable, but can be weighted with dip belt)
const PULLUP_BAR_IDS = ["pullup_bar"] as const;

console.log("Testing unloaded target rules with applySwapTarget\n");

// --- Test 1: Barbell exercise with weight null is LOADED (plan range) ---
const barbellExercise: SessionExerciseWithTarget = {
  id: "ex1",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: null,
};

const barbellResult = applySwapTarget(barbellExercise, {
  equipmentIds: BARBELL_IDS,
  currentTargetReps: 15,
  currentWorkingWeightKg: null,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Barbell with weight null uses plan range (8-12), not stored target (15)",
  barbellResult.repsMin === 8 && barbellResult.repsMax === 12
);

// --- Test 2: Bodyweight exercise with weight null is UNLOADED (stored target) ---
const bodyweightExercise: SessionExerciseWithTarget = {
  id: "ex2",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: null,
};

const bodyweightResult = applySwapTarget(bodyweightExercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 14,
  currentWorkingWeightKg: null,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Bodyweight push-ups with weight null and stored 14 reps → 14-14",
  bodyweightResult.repsMin === 14 && bodyweightResult.repsMax === 14
);

// --- Test 3: Bodyweight exercise with weight 0 is UNLOADED (stored target) ---
const bodyweight0Exercise: SessionExerciseWithTarget = {
  id: "ex3",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: 0,
};

const bodyweight0Result = applySwapTarget(bodyweight0Exercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 16,
  currentWorkingWeightKg: 0,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Bodyweight push-ups with weight 0 and stored 16 reps → 16-16",
  bodyweight0Result.repsMin === 16 && bodyweight0Result.repsMax === 16
);

// --- Test 4: Pull-ups with weight null are UNLOADED (stored target) ---
const pullupUnweightedExercise: SessionExerciseWithTarget = {
  id: "ex4",
  metric: "reps",
  repsMin: 5,
  repsMax: 8,
  workingWeightKg: null,
};

const pullupUnweightedResult = applySwapTarget(pullupUnweightedExercise, {
  equipmentIds: PULLUP_BAR_IDS,
  currentTargetReps: 10,
  currentWorkingWeightKg: null,
  plannedRepsMin: 5,
  plannedRepsMax: 8,
});

check(
  "Pull-ups with weight null and stored 10 reps → 10-10",
  pullupUnweightedResult.repsMin === 10 && pullupUnweightedResult.repsMax === 10
);

// --- Test 5: Pull-ups with weight 10kg are LOADED (plan range) ---
const pullupWeightedExercise: SessionExerciseWithTarget = {
  id: "ex5",
  metric: "reps",
  repsMin: 5,
  repsMax: 8,
  workingWeightKg: 10,
};

const pullupWeightedResult = applySwapTarget(pullupWeightedExercise, {
  equipmentIds: PULLUP_BAR_IDS,
  currentTargetReps: 10,
  currentWorkingWeightKg: 10,
  plannedRepsMin: 5,
  plannedRepsMax: 8,
});

check(
  "Weighted pull-ups (10kg) use plan range (5-8), not stored target (10)",
  pullupWeightedResult.repsMin === 5 && pullupWeightedResult.repsMax === 8
);

// --- Test 6: Reps capped at 2× plannedRepsMax ---
const highRepsExercise: SessionExerciseWithTarget = {
  id: "ex6",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: null,
};

const highRepsResult = applySwapTarget(highRepsExercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 30,
  currentWorkingWeightKg: null,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Push-ups stored at 30 reps capped at 2×12 = 24",
  highRepsResult.repsMin === 24 && highRepsResult.repsMax === 24
);

// --- Test 7: Timed holds capped at 120s ---
const plankExercise: SessionExerciseWithTarget = {
  id: "ex7",
  metric: "seconds",
  repsMin: 30,
  repsMax: 60,
  workingWeightKg: null,
};

const plankResult = applySwapTarget(plankExercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 150,
  currentWorkingWeightKg: null,
  plannedRepsMin: 30,
  plannedRepsMax: 60,
});

check(
  "Plank stored at 150s capped at 120s",
  plankResult.repsMin === 120 && plankResult.repsMax === 120
);

// --- Test 8: Timed hold below cap uses stored value ---
const plank45Exercise: SessionExerciseWithTarget = {
  id: "ex8",
  metric: "seconds",
  repsMin: 30,
  repsMax: 60,
  workingWeightKg: null,
};

const plank45Result = applySwapTarget(plank45Exercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 45,
  currentWorkingWeightKg: null,
  plannedRepsMin: 30,
  plannedRepsMax: 60,
});

check(
  "Plank stored at 45s uses 45s (below 120s cap)",
  plank45Result.repsMin === 45 && plank45Result.repsMax === 45
);

// --- Test 9: Stored target null falls back to plan ---
const noTargetExercise: SessionExerciseWithTarget = {
  id: "ex9",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: null,
};

const noTargetResult = applySwapTarget(noTargetExercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: null,
  currentWorkingWeightKg: null,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Bodyweight exercise with no stored target uses plan range (8-12)",
  noTargetResult.repsMin === 8 && noTargetResult.repsMax === 12
);

// --- Test 10: Stored target below plan min falls back to plan ---
const belowMinExercise: SessionExerciseWithTarget = {
  id: "ex10",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  workingWeightKg: null,
};

const belowMinResult = applySwapTarget(belowMinExercise, {
  equipmentIds: BODYWEIGHT_IDS,
  currentTargetReps: 5,
  currentWorkingWeightKg: null,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
});

check(
  "Bodyweight exercise with stored 5 below plan min 8 falls back to plan (8-12)",
  belowMinResult.repsMin === 8 && belowMinResult.repsMax === 12
);

// --- Summary ---
console.log("");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed\n`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed\n`);
