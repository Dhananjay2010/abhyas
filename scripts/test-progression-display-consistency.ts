#!/usr/bin/env tsx
/**
 * Consistency Test: Display Target = Progression Success Check
 * 
 * Proves that buildRunnerExercise (display) and evaluateProgression (success check)
 * agree on the target by feeding the SAME exercise row through both paths.
 * 
 * Uses #127's real buildRunnerExercise, then progressionInputsFromExercise + evaluateProgression.
 */

import { buildRunnerExercise, type SessionExerciseInput } from "../src/lib/session/build-runner-exercises.js";
import { evaluateProgression, type ProgressState } from "../src/lib/program/progression.js";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs.js";

let failures = 0;

function check(desc: string, passed: boolean, detail?: string): void {
  if (!passed) {
    console.error(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ok   ${desc}${detail ? ` -- ${detail}` : ""}`);
  }
}

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: null,
  currentTargetReps: null,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: null,
  bestE1rm: null,
  totalSessions: 0,
  ...over,
});

console.log("\n=== Progression Display Consistency ===\n");

// Case 1: Bodyweight reps (push-ups) - below target
{
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
      cue: null,
      mechanic: "compound",
      movement_pattern: "horizontal_press",
      primary_muscles: ["chest", "triceps"],
      equipment_ids: [],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 14 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: null,
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    null
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Push-ups: display shows stored 14", display.repsMax === 14);
  
  // Below target: should NOT progress
  const below = evaluateProgression({
    sets: [
      { reps: display.repsMax - 1, weightKg: 0 },
      { reps: display.repsMax - 1, weightKg: 0 },
      { reps: display.repsMax - 1, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Push-ups: 3x13 (display-1) does NOT progress", below.outcome !== "progressed");
  
  // At target: should progress
  const decision = evaluateProgression({
    sets: [
      { reps: display.repsMax, weightKg: 0 },
      { reps: display.repsMax, weightKg: 0 },
      { reps: display.repsMax, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Push-ups: 3x14 succeeds in progression", decision.outcome === "progressed");
}

// Case 2: Pull-ups (unloaded, stored target) - below and at
{
  const row: SessionExerciseInput = {
    id: "se2",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    status: "pending",
    feel: null,
    metric: "reps",
    exercises: {
      id: "ex-pullup",
      name: "Pull-up",
      cue: null,
      mechanic: "compound",
      movement_pattern: "vertical_pull",
      primary_muscles: ["lats", "biceps"],
      equipment_ids: ["pull_up_bar"],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 14 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: null,
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    null
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Pull-ups: display shows stored 14", display.repsMax === 14);
  
  // Below
  const below = evaluateProgression({
    sets: [
      { reps: display.repsMax - 1, weightKg: 0 },
      { reps: display.repsMax - 1, weightKg: 0 },
      { reps: display.repsMax - 1, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Pull-ups: 3x13 (display-1) does NOT progress", below.outcome !== "progressed");
  
  // At target
  const decision = evaluateProgression({
    sets: [
      { reps: display.repsMax, weightKg: 0 },
      { reps: display.repsMax, weightKg: 0 },
      { reps: display.repsMax, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Pull-ups: 3x14 succeeds", decision.outcome === "progressed");
}

// Case 3: Timed hold (plank) - below and at
{
  const row: SessionExerciseInput = {
    id: "se3",
    planned_sets: 3,
    planned_reps_min: 20,
    planned_reps_max: 40,
    rest_seconds: 60,
    status: "pending",
    feel: null,
    metric: "seconds",
    exercises: {
      id: "ex-plank",
      name: "Plank",
      cue: null,
      mechanic: "isolation",
      movement_pattern: "core",
      primary_muscles: ["abs"],
      equipment_ids: [],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 45 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: null,
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    null
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Plank: display shows stored 45s", display.repsMax === 45);
  
  // Below
  const below = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 0 },
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 0 },
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Plank: 3x44s (display-1) does NOT progress", below.outcome !== "progressed");
  
  // At target
  const decision = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: display.repsMax, weightKg: 0 },
      { reps: null, durationSeconds: display.repsMax, weightKg: 0 },
      { reps: null, durationSeconds: display.repsMax, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Plank: 3x45s succeeds", decision.outcome === "progressed");
}

// Case 4: Plank 500s stored (capped at 120s) - below cap distinguishes not-reached from holding-at-cap
{
  const row: SessionExerciseInput = {
    id: "se4",
    planned_sets: 3,
    planned_reps_min: 20,
    planned_reps_max: 40,
    rest_seconds: 60,
    status: "pending",
    feel: null,
    metric: "seconds",
    exercises: {
      id: "ex-plank",
      name: "Plank",
      cue: null,
      mechanic: "isolation",
      movement_pattern: "core",
      primary_muscles: ["abs"],
      equipment_ids: [],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 500 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: null,
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    null
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Plank stored 500: display capped at 120s", display.repsMax === 120);
  
  // 119s: below cap, target not reached
  const fail = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 119, weightKg: 0 },
      { reps: null, durationSeconds: 119, weightKg: 0 },
      { reps: null, durationSeconds: 119, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Plank 119s (cap-1): does NOT progress (kills M13 off-by-one)", fail.outcome !== "progressed");
  check("Plank 119s: message says 'Staying' (target not reached), NOT 'Holding at 120s' (cap message)", fail.message.includes("Staying"));
  
  // 120s: at cap, holding at ceiling
  const success = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 120, weightKg: 0 },
      { reps: null, durationSeconds: 120, weightKg: 0 },
      { reps: null, durationSeconds: 120, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: display.isBodyweight,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Plank 120s: succeeds (hold at cap)", success.outcome === "hold");
}

// Case 5: Weighted hold (weight plate plank with 10 kg) - below and at plan range
{
  const row: SessionExerciseInput = {
    id: "se5",
    planned_sets: 3,
    planned_reps_min: 20,
    planned_reps_max: 40,
    rest_seconds: 60,
    status: "pending",
    feel: null,
    metric: "seconds",
    exercises: {
      id: "ex-weighted-plank",
      name: "Weighted Plank",
      cue: null,
      mechanic: "isolation",
      movement_pattern: "core",
      primary_muscles: ["abs"],
      equipment_ids: ["weight_plate"],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: 10, current_target_reps: 60 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: "kg",
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    "kg"
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Weighted plank: display uses plan max 40s (loaded)", display.repsMax === 40);
  
  // Below plan max
  const below = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 10 },
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 10 },
      { reps: null, durationSeconds: display.repsMax - 1, weightKg: 10 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Weighted plank: 3x39s (plan max-1) does NOT progress", below.outcome !== "progressed");
  
  // At plan max
  const decision = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: display.repsMax, weightKg: 10 },
      { reps: null, durationSeconds: display.repsMax, weightKg: 10 },
      { reps: null, durationSeconds: display.repsMax, weightKg: 10 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 20,
    repsMax: row.planned_reps_max ?? 40,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "seconds",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Weighted plank: 3x40s succeeds", decision.outcome === "progressed");
}

// Case 6: Loaded lift (barbell bench press) - below and at plan range
{
  const row: SessionExerciseInput = {
    id: "se6",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 180,
    status: "pending",
    feel: null,
    metric: "reps",
    exercises: {
      id: "ex-bench",
      name: "Bench Press",
      cue: null,
      mechanic: "compound",
      movement_pattern: "horizontal_press",
      primary_muscles: ["chest", "triceps"],
      equipment_ids: ["barbell"],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: 60, current_target_reps: 14 };
  
  const display = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
    userUnits: "kg",
  });
  
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: row.exercises?.equipment_ids ?? [] },
    "kg"
  );
  const state = fresh({ currentTargetReps: progress.current_target_reps, currentWorkingWeightKg: progress.current_working_weight_kg });
  
  check("Bench press: display uses plan max 12 (loaded)", display.repsMax === 12);
  
  // Below plan max
  const below = evaluateProgression({
    sets: [
      { reps: display.repsMax - 1, weightKg: 60 },
      { reps: display.repsMax - 1, weightKg: 60 },
      { reps: display.repsMax - 1, weightKg: 60 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Bench press: 3x11 (plan max-1) does NOT progress", below.outcome !== "progressed");
  
  // At plan max
  const decision = evaluateProgression({
    sets: [
      { reps: display.repsMax, weightKg: 60 },
      { reps: display.repsMax, weightKg: 60 },
      { reps: display.repsMax, weightKg: 60 },
    ],
    plannedSets: 3,
    repsMin: row.planned_reps_min ?? 8,
    repsMax: row.planned_reps_max ?? 12,
    feel: "right",
    meta: {
      mechanic: row.exercises?.mechanic ?? null,
      metric: row.metric ?? "reps",
      movementPattern: row.exercises?.movement_pattern ?? "other",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Bench press: 3x12 succeeds", decision.outcome === "progressed");
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL CONSISTENCY TESTS PASSED\n");
