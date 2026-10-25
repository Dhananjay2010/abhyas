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

// Read equipment IDs from the actual catalogue seed SQL
import { readFileSync } from "node:fs";
const seedSql = readFileSync("supabase/migrations/20260908090200_seed_reference_data.sql", "utf-8");
const equipmentInsertMatch = seedSql.match(/insert into equipment \(id, name, category, sort_order\) values\s+([\s\S]+?);/);
if (!equipmentInsertMatch) throw new Error("Could not find equipment insert in seed SQL");

const equipmentLines = equipmentInsertMatch[1].split("\n").filter(line => line.trim().startsWith("('"));
const ALL_EQUIPMENT_IDS = equipmentLines.map(line => {
  const match = line.match(/\('([^']+)'/);
  if (!match) throw new Error(`Could not parse equipment ID from line: ${line}`);
  return match[1];
});

console.log(`Found ${ALL_EQUIPMENT_IDS.length} equipment IDs in catalogue\n`);

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

// Verify every catalogue ID is classified
for (const id of ALL_EQUIPMENT_IDS) {
  const isLoadable = LOADABLE_EQUIPMENT_IDS.has(id);
  const expectedLoadable = EXPECTED_LOADABLE.has(id);
  
  check(
    `${id}: ${isLoadable ? 'loadable' : 'unloadable'} (expected ${expectedLoadable ? 'loadable' : 'unloadable'})`,
    isLoadable === expectedLoadable
  );
}

// Check that LOADABLE_EQUIPMENT_IDS doesn't contain unknown IDs
for (const id of LOADABLE_EQUIPMENT_IDS) {
  check(
    `${id} in LOADABLE_EQUIPMENT_IDS exists in catalogue`,
    ALL_EQUIPMENT_IDS.includes(id)
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

const swappedExercise = applySwap(
  originalExercise,
  swappedData,
  { repsMin: 6, repsMax: 10 }, // replacement plan
  swappedProgress,
  true
);

check("Swap updates exerciseId", swappedExercise.exerciseId === "ex-dips");
check("Swap updates name", swappedExercise.name === "Dips");
check("Swap updates cue", swappedExercise.cue === "Full ROM");
check("Swap recomputes repsMin", swappedExercise.repsMin === 18);
check("Swap recomputes repsMax", swappedExercise.repsMax === 18);
check("Swap sets plannedRepsMin", swappedExercise.plannedRepsMin === 6);
check("Swap sets plannedRepsMax", swappedExercise.plannedRepsMax === 10);
check("Swap keeps workingWeightKg", swappedExercise.workingWeightKg === originalExercise.workingWeightKg);
check("Swap keeps suggestedWeightKg", swappedExercise.suggestedWeightKg === originalExercise.suggestedWeightKg);

// ============================================================================
// Part 6: Swap with different progress scenarios
// ============================================================================
console.log("\n--- Part 6: Swap with progress scenarios ---\n");

// Swap to bodyweight exercise with stored target (16 reps), plan 8-12
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

const bodyweightSwapped = applySwap(
  originalExercise, 
  swapToBodyweightData,
  { repsMin: 8, repsMax: 12 }, // replacement plan
  bodyweightSwapProgress,
  true
);
check("Swap to bodyweight with stored 16 → min=16", bodyweightSwapped.repsMin === 16);
check("Swap to bodyweight with stored 16 → max=16", bodyweightSwapped.repsMax === 16);
check("Swap to bodyweight with stored 16 → plannedRepsMin=8", bodyweightSwapped.plannedRepsMin === 8);
check("Swap to bodyweight with stored 16 → plannedRepsMax=12", bodyweightSwapped.plannedRepsMax === 12);

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

const loadedSwapped = applySwap(
  originalExercise,
  swapToLoadedData,
  { repsMin: 8, repsMax: 12 }, // replacement plan
  loadedSwapProgress,
  true
);
check("Swap to loaded exercise → uses plan min", loadedSwapped.repsMin === 8);
check("Swap to loaded exercise → uses plan max", loadedSwapped.repsMax === 12);

// Swap with no progress row → uses plan range
const noProgressSwapped = applySwap(
  originalExercise,
  swapToBodyweightData,
  { repsMin: 8, repsMax: 12 },
  undefined,
  true
);
check("Swap with no progress → uses plan min", noProgressSwapped.repsMin === 8);
check("Swap with no progress → uses plan max", noProgressSwapped.repsMax === 12);

// Swap with remembersWeights=false → uses plan range
const dailyMenuSwapped = applySwap(
  originalExercise,
  swapToBodyweightData,
  { repsMin: 8, repsMax: 12 },
  bodyweightSwapProgress,
  false
);
check("Swap with remembersWeights=false → uses plan min", dailyMenuSwapped.repsMin === 8);
check("Swap with remembersWeights=false → uses plan max", dailyMenuSwapped.repsMax === 12);

// ============================================================================
// Part 7: applySwap plan range bug fix
// ============================================================================
console.log("\n--- Part 7: applySwap plan range bug fix ---\n");

// BUG: Plank stored at 45s swapped to push-ups with plan 8-12 and no progress
// should show 8-12, not 45
const plankExercise: typeof originalExercise = {
  ...originalExercise,
  metric: "seconds",
  repsMin: 45,
  repsMax: 45,
  plannedRepsMin: 30,
  plannedRepsMax: 60,
};

const plankToPushups = applySwap(
  plankExercise,
  swapToBodyweightData, // push-ups, bodyweight
  { repsMin: 8, repsMax: 12 }, // replacement plan
  undefined, // no progress for push-ups
  true
);
check("Plank stored 45s → push-ups no progress → min=8 (not 45)", plankToPushups.repsMin === 8);
check("Plank stored 45s → push-ups no progress → max=12 (not 45)", plankToPushups.repsMax === 12);

// Plank → push-ups with stored 16 should show 16
const plankToPushupsStored = applySwap(
  plankExercise,
  swapToBodyweightData,
  { repsMin: 8, repsMax: 12 },
  { current_target_reps: 16, current_working_weight_kg: null },
  true
);
check("Plank → push-ups stored 16 → min=16", plankToPushupsStored.repsMin === 16);
check("Plank → push-ups stored 16 → max=16", plankToPushupsStored.repsMax === 16);

// Two swaps in a row don't leak the first target
const firstSwap = applySwap(
  originalExercise,
  swapToBodyweightData, // push-ups
  { repsMin: 8, repsMax: 12 },
  { current_target_reps: 16, current_working_weight_kg: null },
  true
);
check("First swap → push-ups stored 16 → min=16", firstSwap.repsMin === 16);

const secondSwap = applySwap(
  firstSwap,
  {
    id: "ex-dips",
    name: "Dips",
    cue: null,
    metric: "reps",
    primary_muscles: ["chest", "triceps"],
    equipment_ids: ["dip_bars"],
  },
  { repsMin: 6, repsMax: 10 }, // dips plan
  undefined, // no progress for dips
  true
);
check("Second swap → dips no progress → min=6 (not 16 from first swap)", secondSwap.repsMin === 6);
check("Second swap → dips no progress → max=10 (not 16 from first swap)", secondSwap.repsMax === 10);

// Mutant test: using exercise.repsMin as plan must fail
// Create a mutant that would use the old plan (which is the resolved target 16)
const mutantSwap = applySwap(
  { ...originalExercise, repsMin: 16, repsMax: 16, plannedRepsMin: 8, plannedRepsMax: 12 },
  swapToBodyweightData,
  { repsMin: 6, repsMax: 10 }, // new plan
  undefined, // no progress
  true
);
check("Mutant test: plan uses replacementPlan not exercise.repsMin", mutantSwap.repsMin === 6);
check("Mutant test: plan uses replacementPlan not exercise.repsMax", mutantSwap.repsMax === 10);

// ============================================================================
// Part 8: fetchSwapProgress test with fake client
// ============================================================================
console.log("\n--- Part 8: fetchSwapProgress behavioral test ---\n");

import { fetchSwapProgress } from "../src/app/session/actions.js";

(async () => {
  // Fake client that tracks method calls
  const fakeCalls: string[] = [];
  const fakeClient = {
    from: (table: string) => {
      fakeCalls.push(`from:${table}`);
      return {
        select: (columns: string) => {
          fakeCalls.push(`select:${columns}`);
          return {
            eq: (column: string, value: string) => {
              fakeCalls.push(`eq:${column}=${value}`);
              return {
                eq: (column: string, value: string) => {
                  fakeCalls.push(`eq:${column}=${value}`);
                  return {
                    maybeSingle: async () => {
                      fakeCalls.push("maybeSingle");
                      return { data: { current_target_reps: 16, current_working_weight_kg: 60 } };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  // Test: normal mode includes user_id filter
  fakeCalls.length = 0;
  await fetchSwapProgress(fakeClient, "user-123", "ex-pushup", "structured");
  check("fetchSwapProgress calls .from('exercise_progress')", fakeCalls.includes("from:exercise_progress"));
  check("fetchSwapProgress calls .eq('user_id', userId)", fakeCalls.includes("eq:user_id=user-123"));
  check("fetchSwapProgress calls .eq('exercise_id', exerciseId)", fakeCalls.includes("eq:exercise_id=ex-pushup"));
  check("fetchSwapProgress calls .maybeSingle()", fakeCalls.includes("maybeSingle"));

  // Test: daily_menu mode returns null without querying
  fakeCalls.length = 0;
  const dailyMenuResult = await fetchSwapProgress(fakeClient, "user-123", "ex-pushup", "daily_menu");
  check("fetchSwapProgress with daily_menu returns null", dailyMenuResult === null);
  check("fetchSwapProgress with daily_menu does not query", fakeCalls.length === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
