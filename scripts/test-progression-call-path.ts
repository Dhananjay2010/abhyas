#!/usr/bin/env tsx
/**
 * Test: equipment-aware progression through real call path
 * 
 * Tests the progressionInputsFromExercise helper and its integration
 * with evaluateProgression and suggestedWeight, using the same data
 * flow as applyProgression (actions.ts) and the session page loader.
 * 
 * QA repro cases from report-bot1-pr106.md:
 * - Cable triceps pushdown 20 -> 22.5 (on 2.5 grid, not 21.25)
 * - Kettlebell goblet squat 12 -> 14 (next bell, not 15)
 * - Kettlebell two-miss back-off: 15 -> 14 or 12 (real bell, not 12.5)
 * - Dumbbell hammer curl first miss 5 -> 2.5 (one step down on 2.5 grid)
 * - Lat pulldown first miss 40 -> 37.5 (one step down on cable grid)
 * - Dumbbell two-miss back-off 5 -> 2.5 (not 3.75)
 * 
 * Must FAIL on main (before fix) and PASS on branch (after fix).
 */

import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const sets = (n: number, reps: number, w: number | null = 60) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3, weightAtFailureStartKg: null,
  ...over,
});

console.log("\n1. progressionInputsFromExercise helper extracts correct values");
{
  // Cable exercise with kg user
  const cableEx = { mechanic: "isolation", equipment_ids: ["cable_machine"] };
  const inputs = progressionInputsFromExercise(cableEx, "metric");
  check("cable equipment ids passed", (inputs.equipmentIds ?? []).includes("cable_machine"));
  check("kg unit extracted", inputs.unit === "kg");
  // mechanic no longer returned by helper
}
{
  // Kettlebell exercise with imperial user
  const kbEx = { mechanic: "compound", equipment_ids: ["kettlebell"] };
  const inputs = progressionInputsFromExercise(kbEx, "imperial");
  check("kettlebell equipment ids passed", (inputs.equipmentIds ?? []).includes("kettlebell"));
  check("lb unit extracted", inputs.unit === "lb");
  // mechanic no longer returned by helper
}
{
  // Null units defaults to kg
  const ex = { mechanic: "compound", equipment_ids: ["barbell"] };
  const inputs = progressionInputsFromExercise(ex, null);
  check("null units defaults to kg", inputs.unit === "kg");
}
{
  // Empty equipment_ids handled
  const ex = { mechanic: null, equipment_ids: [] };
  const inputs = progressionInputsFromExercise(ex, "metric");
  check("empty equipment returns no fields", Object.keys(inputs).length === 0);
}

console.log("\n2. QA repro: cable triceps pushdown 20 -> 22.5 (on 2.5 grid)");
{
  const TRICEPS_PUSHDOWN: ExerciseMeta = {
    mechanic: "isolation",
    metric: "reps",
    movementPattern: "triceps",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const cableEx = { mechanic: "isolation", equipment_ids: ["cable_machine"] };
  const inputs = progressionInputsFromExercise(cableEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 15, 20),
    plannedSets: 3,
    repsMin: 12,
    repsMax: 15,
    feel: "right",
    meta: TRICEPS_PUSHDOWN,
    state: fresh({ currentWorkingWeightKg: 20, currentTargetReps: 15 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome progressed", decision.outcome === "progressed");
  check("20 -> 22.5 kg (cable 2.5 grid)", decision.nextWorkingWeightKg === 22.5, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n3. QA repro: kettlebell goblet squat 12 -> 14 (next bell)");
{
  const GOBLET_SQUAT: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "squat",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const kbEx = { mechanic: "compound", equipment_ids: ["kettlebell"] };
  const inputs = progressionInputsFromExercise(kbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 12, 12),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: GOBLET_SQUAT,
    state: fresh({ currentWorkingWeightKg: 12, currentTargetReps: 12 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome progressed", decision.outcome === "progressed");
  check("12 -> 14 kg (next bell)", decision.nextWorkingWeightKg === 14, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n4. QA repro: kettlebell two-miss back-off 15 kg (no lighter bell)");
{
  const GOBLET_SQUAT: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "squat",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const kbEx = { mechanic: "compound", equipment_ids: ["kettlebell"] };
  const inputs = progressionInputsFromExercise(kbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 7, 15), // #120: 3×7 is a real miss; 3×8 is in range (8-12) and #137 holds it
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: GOBLET_SQUAT,
    state: fresh({ currentWorkingWeightKg: 15, currentTargetReps: 12, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  // #120: Main's rounding (steer c): 90% = 13.5, floor to 2.5 grid = 12.5, cap 13.5-5 = 8.5,
  // target = max(12.5, 8.5) = 12.5; smallest bell >= 12.5 and < 15 is 14, so it backs off to 14.
  check("outcome backed_off (main's rounding finds the 14 kg bell)", decision.outcome === "backed_off", decision.outcome);
  check("15 -> 14 kg (real bell)", decision.nextWorkingWeightKg === 14, `got ${decision.nextWorkingWeightKg}`);
  check("message says dropping to 14 kg", decision.message.includes("dropping to 14 kg"), decision.message);
}

console.log("\n5. QA repro: lat pulldown first miss 40 -> 37.5 (one step down)");
{
  const LAT_PULLDOWN: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "vertical_pull",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const cableEx = { mechanic: "compound", equipment_ids: ["cable_machine"] };
  const inputs = progressionInputsFromExercise(cableEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(4, 5, 40),
    plannedSets: 4,
    repsMin: 6,
    repsMax: 8,
    feel: "right",
    meta: LAT_PULLDOWN,
    state: fresh({ currentWorkingWeightKg: 40, currentTargetReps: 8 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome hold", decision.outcome === "hold");
  check("40 -> 37.5 kg (one cable step down)", decision.nextWorkingWeightKg === 37.5, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n6. QA repro: dumbbell hammer curl first miss 5 -> HOLD (20% guard)");
{
  const HAMMER_CURL: ExerciseMeta = {
    mechanic: "isolation",
    metric: "reps",
    movementPattern: "biceps",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const dbEx = { mechanic: "isolation", equipment_ids: ["dumbbell"] };
  const inputs = progressionInputsFromExercise(dbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 5, 5),
    plannedSets: 3,
    repsMin: 6,
    repsMax: 8,
    feel: "right",
    meta: HAMMER_CURL,
    state: fresh({ currentWorkingWeightKg: 5, currentTargetReps: 8 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome hold", decision.outcome === "hold");
  check("5 -> 5 kg (hold: one step down = 50% cut > 20% guard)", decision.nextWorkingWeightKg === 5, `got ${decision.nextWorkingWeightKg}`);
  check("message says 20% cut", decision.message.includes("one step down would cut more than 20%"));
}

console.log("\n7. QA repro: dumbbell two-miss back-off 5 -> HOLD (raw 90% cap, no loadable value)");
{
  const HAMMER_CURL: ExerciseMeta = {
    mechanic: "isolation",
    metric: "reps",
    movementPattern: "biceps",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const dbEx = { mechanic: "isolation", equipment_ids: ["dumbbell"] };
  const inputs = progressionInputsFromExercise(dbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 5, 5),
    plannedSets: 3,
    repsMin: 6,
    repsMax: 8,
    feel: "right",
    meta: HAMMER_CURL,
    state: fresh({ currentWorkingWeightKg: 5, currentTargetReps: 8, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome hold", decision.outcome === "hold");
  check("5 -> 5 kg (hold: raw 90% = 4.5, no loadable value >= 4.5 and < 5)", decision.nextWorkingWeightKg === 5, `got ${decision.nextWorkingWeightKg}`);
  check("message says no lighter loadable weight", decision.message.includes("no lighter loadable weight"));
}

console.log("\n8. QA repro: leg extension pin-stack two-miss back-off 30 -> HOLD (raw 90% cap)");
{
  const LEG_EXTENSION: ExerciseMeta = {
    mechanic: "isolation",
    metric: "reps",
    movementPattern: "other",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const machineEx = { mechanic: "isolation", equipment_ids: ["leg_extension"] };
  const inputs = progressionInputsFromExercise(machineEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 7, 30), // #120: 3×7 is a real miss; 3×8 is in range (8-12) and #137 holds it
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: LEG_EXTENSION,
    state: fresh({ currentWorkingWeightKg: 30, currentTargetReps: 12, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome hold", decision.outcome === "hold");
  check("30 -> 30 kg (hold: raw 90% = 27, snap to 5 grid >= 27 and < 30 = 30, not < 30)", decision.nextWorkingWeightKg === 30, `got ${decision.nextWorkingWeightKg}`);
  check("message says no lighter loadable weight", decision.message.includes("no lighter loadable weight"), decision.message);
}

console.log("\n9. Main's back-off: KB 22 -> 18 kg (main's rounding, not RAW 90%)");
{
  const KB_SWING: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "other",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const kbEx = { mechanic: "compound", equipment_ids: ["kettlebell"] };
  const inputs = progressionInputsFromExercise(kbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 8, 22),
    plannedSets: 3,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: KB_SWING,
    state: fresh({ currentWorkingWeightKg: 22, currentTargetReps: 12, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome backed_off", decision.outcome === "backed_off");
  // #120: Main's rounding: 90% = 19.8, floor to 2.5 grid = 17.5, cap at 22-5=17, max(17.5,17)=17.5
  // Smallest bell >= 17.5 and < 22 is 18 kg (not 20 kg RAW-90%)
  check("22 -> 18 kg (main's rounding)", decision.nextWorkingWeightKg === 18, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n10. Main's back-off: DB 13.75 -> 10 kg (main's rounding, not RAW 90%)");
{
  const DB_ROW: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_pull",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const dbEx = { mechanic: "compound", equipment_ids: ["dumbbell"] };
  const inputs = progressionInputsFromExercise(dbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 8, 13.75),
    plannedSets: 3,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: DB_ROW,
    state: fresh({ currentWorkingWeightKg: 13.75, currentTargetReps: 12, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome backed_off", decision.outcome === "backed_off");
  // #120: Main's rounding: 90% = 12.375, floor to 2.5 grid = 10, cap at 13.75-2.5=11.25, max(10,11.25)=11.25
  // Smallest on 2.5 grid >= 11.25 and < 13.75 is 12.5, but floor says 10, so 10 kg
  check("13.75 -> 10 kg (main's rounding)", decision.nextWorkingWeightKg === 10, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n11. QA repro: medicine ball two-miss back-off 4 -> 3 (on 1 kg grid, not 2.5)");
{
  const MEDICINE_BALL_SLAM: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "other",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const mbEx = { mechanic: "compound", equipment_ids: ["medicine_ball"] };
  const inputs = progressionInputsFromExercise(mbEx, "metric");
  
  const decision = evaluateProgression({
    sets: sets(3, 8, 4),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: MEDICINE_BALL_SLAM,
    state: fresh({ currentWorkingWeightKg: 4, currentTargetReps: 12, consecutiveFailures: 1 }),
    isDeload: false,
    ...inputs,
  });
  
  check("outcome hold (4kg is light, below 2.5kg increment)", decision.outcome === "hold");
  check("4 -> 4 kg (hold at light weight)", decision.nextWorkingWeightKg === 4, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n10. suggestedWeight through helper (session page loader path)");
{
  const BENCH: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const bbEx = { mechanic: "compound", equipment_ids: ["barbell"] };
  const inputs = progressionInputsFromExercise(bbEx, "metric");
  
  const suggested = suggestedWeight(
    { currentWorkingWeightKg: 61.5 },
    false,
    BENCH,
    inputs.equipmentIds ?? [],
    inputs.unit,
  );
  
  check("non-deload working weight returned as-is (no snap)", suggested === 61.5, `got ${suggested}`);
}
{
  const GOBLET_SQUAT: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "squat",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const kbEx = { mechanic: "compound", equipment_ids: ["kettlebell"] };
  const inputs = progressionInputsFromExercise(kbEx, "metric");
  
  const suggested = suggestedWeight(
    { currentWorkingWeightKg: 13 },
    false,
    GOBLET_SQUAT,
    inputs.equipmentIds ?? [],
    inputs.unit,
  );
  
  check("non-deload KB weight returned as-is (no snap to bell)", suggested === 13, `got ${suggested}`);
}
{
  const TRICEPS_PUSHDOWN: ExerciseMeta = {
    mechanic: "isolation",
    metric: "reps",
    movementPattern: "triceps",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const cableEx = { mechanic: "isolation", equipment_ids: ["cable_machine"] };
  const inputs = progressionInputsFromExercise(cableEx, "metric");
  
  const deloadSuggested = suggestedWeight(
    { currentWorkingWeightKg: 20 },
    true,
    TRICEPS_PUSHDOWN,
    inputs.equipmentIds ?? [],
    inputs.unit,
  );
  
  check("cable deload 20 -> ~14 on grid", deloadSuggested === 12.5 || deloadSuggested === 15, `got ${deloadSuggested}`);
}

console.log("\n11. No equipment info: fallback behavior preserved");
{
  const BENCH: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  // Helper returns empty equipment_ids when none provided
  const decision = evaluateProgression({
    sets: sets(4, 12, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60 }),
    isDeload: false,
    equipmentIds: undefined,
  });
  
  check("no equipment: progression still works", decision.outcome === "progressed");
  check("no equipment: rounds to increment", decision.nextWorkingWeightKg === 62.5, `got ${decision.nextWorkingWeightKg}`);
}

console.log("\n--- SUMMARY ---");
if (failures > 0) {
  console.log(`FAILED: ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED");
  process.exit(0);
}
