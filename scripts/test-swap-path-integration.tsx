/**
 * MEDIUM-2: Test the real swap path (applySwapResult then applySwapTarget).
 * 
 * The session runner applies swaps in two stages:
 * 1. applySwapResult: updates exercise identity, metric, plan range, and weight prefill
 * 2. applySwapTarget: resolves display targets based on stored progression
 * 
 * This test ensures both functions compose correctly for unloaded/loaded exercises.
 */

import { applySwapResult, type SessionExercise } from "@/lib/session/apply-swap";
import { applySwapTarget, type SessionExerciseWithTarget } from "@/lib/session/apply-swap-target";
import type { SwapResult } from "@/app/session/actions";

// Helper to check if exercise has numeric targets (after swap)
function hasNumericTargets(ex: SessionExercise): boolean {
  return typeof ex.repsMin === "number" && typeof ex.repsMax === "number";
}

// Helper to assert non-null targets for testing
function assertNumericTargets(ex: SessionExercise): asserts ex is SessionExercise & { metric: "reps" | "seconds"; repsMin: number; repsMax: number; workingWeightKg: number | null } {
  if (!hasNumericTargets(ex)) {
    throw new Error("Test setup error: exercise missing numeric targets");
  }
}

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing real swap path: applySwapResult + applySwapTarget\n");

// --- Test 1: Bodyweight swap (unloaded) uses stored target ---
const BODYWEIGHT_IDS: readonly string[] = [];

const initialExercises: SessionExercise[] = [
  {
    id: "session-ex-1",
    exerciseId: "pushup",
    name: "Push-Up",
    cue: null,
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    suggestedWeightKg: null,
    workingWeightKg: null,
    isBodyweight: true,
  },
];

const bodyweightSwapResult: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "dip",
  name: "Dip",
  cue: "Full range of motion",
  metric: "reps",
  repsMin: 6,
  repsMax: 10,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: ["dip_bars"],
  currentTargetReps: 12,
};

const afterApplySwapResult = applySwapResult(initialExercises, "session-ex-1", bodyweightSwapResult);
check(
  "applySwapResult: exercise swapped to Dip",
  afterApplySwapResult[0].name === "Dip" && afterApplySwapResult[0].exerciseId === "dip"
);

const swappedEx1 = afterApplySwapResult[0];
assertNumericTargets(swappedEx1);

const afterApplySwapTarget = applySwapTarget(
  swappedEx1,
  {
    equipmentIds: bodyweightSwapResult.equipmentIds,
    currentTargetReps: bodyweightSwapResult.currentTargetReps,
    currentWorkingWeightKg: bodyweightSwapResult.workingWeightKg,
    plannedRepsMin: bodyweightSwapResult.repsMin ?? 6,
    plannedRepsMax: bodyweightSwapResult.repsMax ?? 10,
  }
);

check(
  "applySwapTarget: unloaded dips (12 stored) → 12-12",
  afterApplySwapTarget.repsMin === 12 && afterApplySwapTarget.repsMax === 12
);

// --- Test 2: Loaded swap (barbell) uses plan range ---
const loadedExercises: SessionExercise[] = [
  {
    id: "session-ex-2",
    exerciseId: "squat",
    name: "Squat",
    cue: null,
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    suggestedWeightKg: 60,
    workingWeightKg: 60,
    isBodyweight: false,
  },
];

const loadedSwapResult: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "front-squat",
  name: "Front Squat",
  cue: "Elbows up",
  metric: "reps",
  repsMin: 6,
  repsMax: 10,
  weightPrefill: 50,
  workingWeightKg: 50,
  isBodyweight: false,
  equipmentIds: ["barbell"],
  currentTargetReps: 15,
};

const afterLoadedSwapResult = applySwapResult(loadedExercises, "session-ex-2", loadedSwapResult);
check(
  "applySwapResult: loaded exercise swapped to Front Squat with 50kg prefill",
  afterLoadedSwapResult[0].name === "Front Squat" && afterLoadedSwapResult[0].suggestedWeightKg === 50
);

const swappedEx2 = afterLoadedSwapResult[0];
assertNumericTargets(swappedEx2);

const afterLoadedSwapTarget = applySwapTarget(
  swappedEx2,
  {
    equipmentIds: loadedSwapResult.equipmentIds,
    currentTargetReps: loadedSwapResult.currentTargetReps,
    currentWorkingWeightKg: loadedSwapResult.workingWeightKg,
    plannedRepsMin: loadedSwapResult.repsMin ?? 6,
    plannedRepsMax: loadedSwapResult.repsMax ?? 10,
  }
);

check(
  "applySwapTarget: loaded front squat uses plan range (6-10), not stored 15",
  afterLoadedSwapTarget.repsMin === 6 && afterLoadedSwapTarget.repsMax === 10
);

// --- Test 3: Unloaded to loaded swap (pull-up to weighted pull-up) ---
const pullupExercises: SessionExercise[] = [
  {
    id: "session-ex-3",
    exerciseId: "pullup",
    name: "Pull-Up",
    cue: null,
    metric: "reps",
    repsMin: 5,
    repsMax: 8,
    suggestedWeightKg: null,
    workingWeightKg: null,
    isBodyweight: true,
  },
];

const weightedPullupSwap: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "pullup",
  name: "Pull-Up (Weighted)",
  cue: "Dip belt with plates",
  metric: "reps",
  repsMin: 5,
  repsMax: 8,
  weightPrefill: 10,
  workingWeightKg: 10,
  isBodyweight: false,
  equipmentIds: ["pullup_bar", "dip_belt"],
  currentTargetReps: 12,
};

const afterWeightedPullupResult = applySwapResult(pullupExercises, "session-ex-3", weightedPullupSwap);

const swappedEx3 = afterWeightedPullupResult[0];
assertNumericTargets(swappedEx3);

const afterWeightedPullupTarget = applySwapTarget(
  swappedEx3,
  {
    equipmentIds: weightedPullupSwap.equipmentIds,
    currentTargetReps: weightedPullupSwap.currentTargetReps,
    currentWorkingWeightKg: weightedPullupSwap.workingWeightKg,
    plannedRepsMin: weightedPullupSwap.repsMin ?? 5,
    plannedRepsMax: weightedPullupSwap.repsMax ?? 8,
  }
);

check(
  "Weighted pull-up (10kg) uses plan range (5-8), not stored unweighted target (12)",
  afterWeightedPullupTarget.repsMin === 5 && afterWeightedPullupTarget.repsMax === 8
);

// --- Test 4: Timed exercise swap with cap ---
const plankExercises: SessionExercise[] = [
  {
    id: "session-ex-4",
    exerciseId: "plank",
    name: "Plank",
    cue: null,
    metric: "seconds",
    repsMin: 30,
    repsMax: 60,
    suggestedWeightKg: null,
    workingWeightKg: null,
    isBodyweight: true,
  },
];

const sidePlankSwap: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "side-plank",
  name: "Side Plank",
  cue: "Hold each side",
  metric: "seconds",
  repsMin: 30,
  repsMax: 60,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: [],
  currentTargetReps: 150,
};

const afterSidePlankResult = applySwapResult(plankExercises, "session-ex-4", sidePlankSwap);

const swappedEx4 = afterSidePlankResult[0];
assertNumericTargets(swappedEx4);

const afterSidePlankTarget = applySwapTarget(
  swappedEx4,
  {
    equipmentIds: sidePlankSwap.equipmentIds,
    currentTargetReps: sidePlankSwap.currentTargetReps,
    currentWorkingWeightKg: sidePlankSwap.workingWeightKg,
    plannedRepsMin: sidePlankSwap.repsMin ?? 30,
    plannedRepsMax: sidePlankSwap.repsMax ?? 60,
  }
);

check(
  "Timed side plank with stored 150s capped at 120s",
  afterSidePlankTarget.repsMin === 120 && afterSidePlankTarget.repsMax === 120
);

// --- Test 5: Swap with no progress (undefined) → uses plan range ---
const noProgressExercises: SessionExercise[] = [
  {
    id: "session-ex-5",
    exerciseId: "pushup",
    name: "Push-Up",
    cue: null,
    metric: "reps",
    repsMin: 8,
    repsMax: 12,
    suggestedWeightKg: null,
    workingWeightKg: null,
    isBodyweight: true,
  },
];

const noProgressSwap: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "wide-pushup",
  name: "Wide Push-Up",
  cue: "Hands wider than shoulders",
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: [],
  currentTargetReps: null, // No stored progress
};

const afterNoProgressResult = applySwapResult(noProgressExercises, "session-ex-5", noProgressSwap);
const swappedEx5 = afterNoProgressResult[0];
assertNumericTargets(swappedEx5);

const afterNoProgressTarget = applySwapTarget(
  swappedEx5,
  {
    equipmentIds: noProgressSwap.equipmentIds,
    currentTargetReps: noProgressSwap.currentTargetReps,
    currentWorkingWeightKg: noProgressSwap.workingWeightKg,
    plannedRepsMin: noProgressSwap.repsMin ?? 8,
    plannedRepsMax: noProgressSwap.repsMax ?? 12,
  }
);

check(
  "Swap with no progress (null) → uses plan range 8-12",
  afterNoProgressTarget.repsMin === 8 && afterNoProgressTarget.repsMax === 12
);

// --- Test 6: Metric change with no progress (plank → pushups) ---
const plankToRepsExercises: SessionExercise[] = [
  {
    id: "session-ex-6",
    exerciseId: "plank",
    name: "Plank",
    cue: null,
    metric: "seconds",
    repsMin: 45,
    repsMax: 45,
    suggestedWeightKg: null,
    workingWeightKg: null,
    isBodyweight: true,
  },
];

const plankToPushupsSwap: SwapResult & { exerciseId: string; name: string; cue: string | null } = {
  exerciseId: "pushup",
  name: "Push-Up",
  cue: null,
  metric: "reps",
  repsMin: 8,
  repsMax: 12,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: [],
  currentTargetReps: null, // No pushup progress (metric changed)
};

const afterPlankToPushupsResult = applySwapResult(plankToRepsExercises, "session-ex-6", plankToPushupsSwap);
const swappedEx6 = afterPlankToPushupsResult[0];
assertNumericTargets(swappedEx6);

const afterPlankToPushupsTarget = applySwapTarget(
  swappedEx6,
  {
    equipmentIds: plankToPushupsSwap.equipmentIds,
    currentTargetReps: plankToPushupsSwap.currentTargetReps,
    currentWorkingWeightKg: plankToPushupsSwap.workingWeightKg,
    plannedRepsMin: plankToPushupsSwap.repsMin ?? 8,
    plannedRepsMax: plankToPushupsSwap.repsMax ?? 12,
  }
);

check(
  "Plank 45s → pushups no progress → uses plan 8-12 (not 45)",
  afterPlankToPushupsTarget.repsMin === 8 && afterPlankToPushupsTarget.repsMax === 12
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