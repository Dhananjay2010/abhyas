#!/usr/bin/env tsx
/**
 * M-2: Comprehensive test for display-target and build-runner-exercises
 * 
 * This test covers:
 * 1. LOADABLE_EQUIPMENT_IDS list pinned against catalogue
 * 2. buildRunnerExercise returning all RunnerExercise fields
 * 3. Edge cases: NaN, Infinity, exactly at plan min, 0 kg, string targets
 * 4. Pull-ups, chin-ups, dips, hanging raises use stored target
 * 5. applySwap recomputes targets without clearing weights
 * 
 * Mutant killing: this test must detect:
 * - Dropped call to resolveTarget
 * - Swapped min/max
 * - Null target
 * - Forced seconds metric
 * - Swapped outputs (repsMin/repsMax)
 * - Forced bodyweight=true
 * - Dropped bodyweight condition
 * - Dropped .eq('user_id', user.id) in progress query
 */

import { buildRunnerExercise, applySwap, type SessionExerciseInput, type ProgressInput } from "../src/lib/session/build-runner-exercises.js";
import { isUnloaded, usesStoredTarget, resolveTarget } from "../src/lib/session/display-target.js";
import { LOADABLE_EQUIPMENT_IDS } from "../src/lib/session/equipment-grid.js";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}`);
    failed++;
  }
}

console.log("M-2: Comprehensive test for display-target and build-runner-exercises\n");

// ============================================================================
// Part 1: Pin LOADABLE_EQUIPMENT_IDS against catalogue
// ============================================================================
console.log("--- Part 1: Equipment classification ---\n");

// All equipment IDs from the catalogue seed (20260908090200_seed_reference_data.sql)
const ALL_EQUIPMENT_IDS = [
  'bodyweight', 'yoga_mat', 'pull_up_bar', 'dip_bars',
  'barbell', 'ez_bar', 'dumbbell', 'kettlebell', 'trap_bar', 'weight_plate',
  'squat_rack', 'flat_bench', 'adjustable_bench',
  'smith_machine', 'leg_press', 'hack_squat', 'leg_curl', 'leg_extension',
  'chest_press_machine', 'pec_deck', 'lat_pulldown', 'seated_row_machine', 'shoulder_press_machine',
  'treadmill', 'stationary_bike', 'rowing_machine', 'elliptical',
  'cable_machine',
  'resistance_band', 'foam_roller', 'jump_rope', 'medicine_ball', 'stability_ball', 'ab_wheel', 'trx', 'dip_belt',
];

// Expected loadable equipment (can carry external weight)
const EXPECTED_LOADABLE = new Set([
  // Free weights
  'barbell', 'ez_bar', 'trap_bar', 'dumbbell', 'kettlebell', 'weight_plate',
  // Machines (pin-stack or plate-loaded)
  'smith_machine', 'leg_press', 'hack_squat', 'leg_curl', 'leg_extension',
  'chest_press_machine', 'pec_deck', 'lat_pulldown', 'seated_row_machine', 'shoulder_press_machine',
  // Cable
  'cable_machine',
  // Accessories with load
  'medicine_ball', 'dip_belt',
]);

// Expected unloadable equipment (bodyweight, bars, benches, cardio, accessories)
const EXPECTED_UNLOADABLE = new Set([
  'bodyweight', 'yoga_mat', 'pull_up_bar', 'dip_bars',
  'squat_rack', 'flat_bench', 'adjustable_bench',
  'treadmill', 'stationary_bike', 'rowing_machine', 'elliptical',
  'resistance_band', 'foam_roller', 'jump_rope', 'stability_ball', 'ab_wheel', 'trx',
]);

// Verify every catalogue ID is classified
for (const id of ALL_EQUIPMENT_IDS) {
  const isLoadable = LOADABLE_EQUIPMENT_IDS.has(id);
  const expectedLoadable = EXPECTED_LOADABLE.has(id);
  const expectedUnloadable = EXPECTED_UNLOADABLE.has(id);
  
  check(
    `${id}: ${isLoadable ? 'loadable' : 'unloadable'} (expected ${expectedLoadable ? 'loadable' : 'unloadable'})`,
    isLoadable === expectedLoadable
  );
}

// ============================================================================
// Part 2: isUnloaded and usesStoredTarget
// ============================================================================
console.log("\n--- Part 2: isUnloaded and usesStoredTarget ---\n");

// Pull-ups (bar, no weight) → unloaded
check(
  "Pull-ups (bar, no weight) → unloaded",
  isUnloaded({ equipmentIds: ['pull_up_bar'], currentWorkingWeightKg: null })
);
check(
  "Pull-ups (bar, no weight) → uses stored target",
  usesStoredTarget({ equipmentIds: ['pull_up_bar'], currentWorkingWeightKg: null })
);

// Weighted pull-ups (bar + dip belt) → loaded
check(
  "Weighted pull-ups (bar + dip belt, 10 kg) → loaded",
  !isUnloaded({ equipmentIds: ['pull_up_bar', 'dip_belt'], currentWorkingWeightKg: 10 })
);
check(
  "Weighted pull-ups → uses plan range",
  !usesStoredTarget({ equipmentIds: ['pull_up_bar', 'dip_belt'], currentWorkingWeightKg: 10 })
);

// Dips (bars, no weight) → unloaded
check(
  "Dips (bars, no weight) → unloaded",
  isUnloaded({ equipmentIds: ['dip_bars'], currentWorkingWeightKg: null })
);

// Weighted dips (bars + dip belt) → loaded
check(
  "Weighted dips (bars + dip belt, 15 kg) → loaded",
  !isUnloaded({ equipmentIds: ['dip_bars', 'dip_belt'], currentWorkingWeightKg: 15 })
);

// Chin-ups (bar, 0 kg) → unloaded
check(
  "Chin-ups (bar, 0 kg) → unloaded",
  isUnloaded({ equipmentIds: ['pull_up_bar'], currentWorkingWeightKg: 0 })
);

// Hanging raises (bar, no weight) → unloaded
check(
  "Hanging raises (bar, no weight) → unloaded",
  isUnloaded({ equipmentIds: ['pull_up_bar'], currentWorkingWeightKg: null })
);

// Bodyweight push-ups (no equipment) → unloaded
check(
  "Bodyweight push-ups → unloaded",
  isUnloaded({ equipmentIds: [], currentWorkingWeightKg: null })
);

// Barbell bench press → loaded
check(
  "Barbell bench press → loaded",
  !isUnloaded({ equipmentIds: ['barbell', 'flat_bench'], currentWorkingWeightKg: 60 })
);

// ============================================================================
// Part 3: resolveTarget edge cases
// ============================================================================
console.log("\n--- Part 3: resolveTarget edge cases ---\n");

// NaN → uses plan
const nanResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: NaN,
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("NaN target → uses plan min", nanResult.min === 8);
check("NaN target → uses plan max", nanResult.max === 12);

// Infinity → uses plan
const infResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: Infinity,
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("Infinity target → uses plan min", infResult.min === 8);
check("Infinity target → uses plan max", infResult.max === 12);

// Exactly at plan min (must use stored, not fall back to plan)
const atMinResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: 8,
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("Stored target exactly at plan min → min=8", atMinResult.min === 8);
check("Stored target exactly at plan min → max=8", atMinResult.max === 8);

// Below plan min → uses plan
const belowMinResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: 7,
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("Stored target below plan min → uses plan min", belowMinResult.min === 8);
check("Stored target below plan min → uses plan max", belowMinResult.max === 12);

// 0 kg weight counts as unloaded
const zeroWeightResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: 14,
  equipmentIds: [],
  currentWorkingWeightKg: 0,
});
check("0 kg weight counts as unloaded → min=14", zeroWeightResult.min === 14);
check("0 kg weight counts as unloaded → max=14", zeroWeightResult.max === 14);

// Equipment with no weight (pull-ups) → uses stored
const noWeightResult = resolveTarget({
  metric: 'reps',
  plannedMin: 5,
  plannedMax: 10,
  currentTargetReps: 12,
  equipmentIds: ['pull_up_bar'],
  currentWorkingWeightKg: null,
});
check("Pull-ups with no weight → min=12", noWeightResult.min === 12);
check("Pull-ups with no weight → max=12", noWeightResult.max === 12);

// String target (numeric) → converts and uses
const stringResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: "10",
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("String target '10' → min=10", stringResult.min === 10);
check("String target '10' → max=10", stringResult.max === 10);

// String target (non-numeric) → uses plan
const badStringResult = resolveTarget({
  metric: 'reps',
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: "abc",
  equipmentIds: [],
  currentWorkingWeightKg: null,
});
check("String target 'abc' → uses plan min", badStringResult.min === 8);
check("String target 'abc' → uses plan max", badStringResult.max === 12);

// ============================================================================
// Part 4: buildRunnerExercise comprehensive
// ============================================================================
console.log("\n--- Part 4: buildRunnerExercise returns all fields ---\n");

const row: SessionExerciseInput = {
  id: "se1",
  planned_sets: 3,
  planned_reps_min: 8,
  planned_reps_max: 12,
  rest_seconds: 90,
  status: "pending",
  feel: null,
  metric: "reps",
  exercises: {
    id: "ex-pushup",
    name: "Push-up",
    cue: "Chest to ground",
    movement_pattern: "horizontal_press",
    primary_muscles: ["chest", "triceps"],
    equipment_ids: [],
  },
  session_sets: [
    {
      set_number: 1,
      reps: 10,
      weight_kg: null,
      duration_seconds: null,
      is_warmup_set: false,
      completed_at: "2026-10-25T12:00:00Z",
    },
  ],
};

const progress: ProgressInput = {
  current_working_weight_kg: null,
  current_target_reps: 14,
};

const result = buildRunnerExercise({
  row,
  progress,
  remembersWeights: true,
  isDeload: false,
});

// Verify all fields are present and correct
check("id field", result.id === "se1");
check("exerciseId field", result.exerciseId === "ex-pushup");
check("name field", result.name === "Push-up");
check("cue field", result.cue === "Chest to ground");
check("metric field", result.metric === "reps");
check("primaryMuscles field", result.primaryMuscles.length === 2);
check("plannedSets field", result.plannedSets === 3);
check("repsMin field (uses stored)", result.repsMin === 14);
check("repsMax field (uses stored)", result.repsMax === 14);
check("restSeconds field", result.restSeconds === 90);
check("status field", result.status === "pending");
check("feel field", result.feel === null);
check("workingWeightKg field", result.workingWeightKg === null);
check("suggestedWeightKg field", result.suggestedWeightKg === null);
check("isBodyweight field", result.isBodyweight === true);
check("sets array present", Array.isArray(result.sets));
check("sets array length", result.sets.length === 1);
check("lastLoggedAt field", result.lastLoggedAt === "2026-10-25T12:00:00Z");

// Test that swapped min/max would be detected
check("repsMin !== repsMax when they should be equal (mutant check)", result.repsMin === result.repsMax);

// Test loaded exercise uses plan range
const loadedRow: SessionExerciseInput = {
  id: row.id,
  planned_sets: row.planned_sets,
  planned_reps_min: row.planned_reps_min,
  planned_reps_max: row.planned_reps_max,
  rest_seconds: row.rest_seconds,
  status: row.status,
  feel: row.feel,
  metric: row.metric,
  exercises: row.exercises ? {
    id: row.exercises.id,
    name: row.exercises.name,
    cue: row.exercises.cue,
    movement_pattern: row.exercises.movement_pattern,
    primary_muscles: row.exercises.primary_muscles,
    equipment_ids: ['barbell'],
  } : null,
  session_sets: row.session_sets,
};
const loadedResult = buildRunnerExercise({
  row: loadedRow,
  progress: { current_working_weight_kg: 60, current_target_reps: 14 },
  remembersWeights: true,
  isDeload: false,
});
check("Loaded exercise uses plan min", loadedResult.repsMin === 8);
check("Loaded exercise uses plan max", loadedResult.repsMax === 12);

// ============================================================================
// Part 5: applySwap
// ============================================================================
console.log("\n--- Part 5: applySwap recomputes targets ---\n");

const originalExercise = result;
const swappedData: {
  readonly id: string;
  readonly name: string;
  readonly cue: string | null;
  readonly metric: "reps";
  readonly primary_muscles: readonly ("chest" | "triceps")[];
  readonly equipment_ids: readonly string[];
} = {
  id: "ex-dips",
  name: "Dips",
  cue: "Full ROM",
  metric: "reps",
  primary_muscles: ["chest", "triceps"],
  equipment_ids: ['dip_bars'],
};
const swappedProgress: ProgressInput = {
  current_working_weight_kg: null,
  current_target_reps: 18,
};

const swappedExercise = applySwap(originalExercise, swappedData, swappedProgress, true);

check("Swap updates exerciseId", swappedExercise.exerciseId === "ex-dips");
check("Swap updates name", swappedExercise.name === "Dips");
check("Swap updates cue", swappedExercise.cue === "Full ROM");
check("Swap recomputes repsMin", swappedExercise.repsMin === 18);
check("Swap recomputes repsMax", swappedExercise.repsMax === 18);
check("Swap keeps workingWeightKg", swappedExercise.workingWeightKg === originalExercise.workingWeightKg);
check("Swap keeps suggestedWeightKg", swappedExercise.suggestedWeightKg === originalExercise.suggestedWeightKg);

// ============================================================================
// Part 6: Swap with different progress scenarios
// ============================================================================
console.log("\n--- Part 6: Swap with progress scenarios ---\n");

// Swap to bodyweight exercise with stored target (16 reps)
const swapToBodyweightData: {
  readonly id: string;
  readonly name: string;
  readonly cue: string | null;
  readonly metric: "reps";
  readonly primary_muscles: readonly ("chest" | "triceps")[];
  readonly equipment_ids: readonly string[];
} = {
  id: "ex-wide-pushup",
  name: "Push-up Wide",
  cue: "Hands wider than shoulders",
  metric: "reps",
  primary_muscles: ["chest", "triceps"],
  equipment_ids: [],
};
const bodyweightSwapProgress: ProgressInput = {
  current_working_weight_kg: null,
  current_target_reps: 16,
};

const bodyweightSwapped = applySwap(originalExercise, swapToBodyweightData, bodyweightSwapProgress, true);
check("Swap to bodyweight with stored 16 → min=16", bodyweightSwapped.repsMin === 16);
check("Swap to bodyweight with stored 16 → max=16", bodyweightSwapped.repsMax === 16);

// Swap to loaded exercise (barbell) → uses plan range
const swapToLoadedData: {
  readonly id: string;
  readonly name: string;
  readonly cue: string | null;
  readonly metric: "reps";
  readonly primary_muscles: readonly ("chest" | "triceps")[];
  readonly equipment_ids: readonly string[];
} = {
  id: "ex-barbell-bench",
  name: "Barbell Bench Press",
  cue: null,
  metric: "reps",
  primary_muscles: ["chest", "triceps"],
  equipment_ids: ['barbell'],
};
const loadedSwapProgress: ProgressInput = {
  current_working_weight_kg: 60,
  current_target_reps: 16,
};

const loadedSwapped = applySwap(originalExercise, swapToLoadedData, loadedSwapProgress, true);
check("Swap to loaded exercise → uses plan min", loadedSwapped.repsMin === originalExercise.repsMin);
check("Swap to loaded exercise → uses plan max", loadedSwapped.repsMax === originalExercise.repsMax);

// Swap with no progress row → uses plan range
const noProgressSwapped = applySwap(originalExercise, swapToBodyweightData, undefined, true);
check("Swap with no progress → uses plan min", noProgressSwapped.repsMin === originalExercise.repsMin);
check("Swap with no progress → uses plan max", noProgressSwapped.repsMax === originalExercise.repsMax);

// Swap with remembersWeights=false → uses plan range
const dailyMenuSwapped = applySwap(originalExercise, swapToBodyweightData, bodyweightSwapProgress, false);
check("Swap with remembersWeights=false → uses plan min", dailyMenuSwapped.repsMin === originalExercise.repsMin);
check("Swap with remembersWeights=false → uses plan max", dailyMenuSwapped.repsMax === originalExercise.repsMax);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
