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
  totalSessions: 0, weightAtFailureStartKg: null,
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

// Case 9: Dips (bodyweight on dip_bars) - stored 14
console.log("\n9. Dips (bodyweight on dip_bars) - stored 14");
{
  const row: SessionExerciseInput = {
    id: "se_dips",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    rest_seconds: 90,
    status: "pending",
    feel: null,
    exercises: {
      id: "dips_exercise",
      name: "Dips",
      cue: null,
      movement_pattern: "vertical_press",
      mechanic: "compound",
      primary_muscles: ["chest", "triceps"],
      equipment_ids: ["dip_bars"],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 14 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: ["dip_bars"] },
    "kg"
  );
  
  check("Dips: display target = 14", runner.repsMax === 14);
  
  // Hit 14 reps exactly (not above)
  const state = fresh({ currentTargetReps: 14, totalSessions: 5, weightAtFailureStartKg: null });
  const decision = evaluateProgression({
    sets: [{ reps: 14, weightKg: null, durationSeconds: null }, { reps: 14, weightKg: null, durationSeconds: null }, { reps: 14, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_press",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Dips: 3x14 succeeds", decision.outcome === "progressed");
  check("Dips: 3x13 does NOT succeed", evaluateProgression({
    sets: [{ reps: 13, weightKg: null, durationSeconds: null }, { reps: 13, weightKg: null, durationSeconds: null }, { reps: 13, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_press",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

// Case 10: Push-ups stored 26 → capped at 24 (2×repsMax)
console.log("\n10. Push-ups stored 26 → capped at 24");
{
  const row: SessionExerciseInput = {
    id: "se_pushups",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    rest_seconds: 90,
    status: "pending",
    feel: null,
    exercises: {
      id: "pushups_exercise",
      name: "Push-Ups",
      cue: null,
      movement_pattern: "horizontal_press",
      mechanic: "compound",
      primary_muscles: ["chest", "triceps"],
      equipment_ids: [],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 26 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  check("Push-ups: display shows 24 (cap 2×12)", runner.repsMax === 24);
  
  // Hit 24 exactly
  const state = fresh({ currentTargetReps: 26, totalSessions: 10, weightAtFailureStartKg: null });
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: [] },
    "kg"
  );
  
  const decision = evaluateProgression({
    sets: [{ reps: 24, weightKg: null, durationSeconds: null }, { reps: 24, weightKg: null, durationSeconds: null }, { reps: 24, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "horizontal_press",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Push-ups: 3x24 succeeds", decision.outcome === "progressed");
  check("Push-ups: 3x23 does NOT succeed", evaluateProgression({
    sets: [{ reps: 23, weightKg: null, durationSeconds: null }, { reps: 23, weightKg: null, durationSeconds: null }, { reps: 23, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "horizontal_press",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

// Case 11: Stored 6 below plan min 8 → uses plan min
console.log("\n11. Stored 6 below plan min 8 → shows 8");
{
  const row: SessionExerciseInput = {
    id: "se_stored_below_min",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    rest_seconds: 120,
    status: "pending",
    feel: null,
    exercises: {
      id: "squat_exercise",
      name: "Squat",
      cue: null,
      movement_pattern: "squat",
      mechanic: "compound",
      primary_muscles: ["quads", "glutes"],
      equipment_ids: ["barbell"],
    },
    session_sets: [],
  };
  
  const progress = { current_target_reps: 6, current_working_weight_kg: 60 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  check("Stored 6 < min 8: display shows plan range 8-12", runner.repsMin === 8 && runner.repsMax === 12);
  
  const state = fresh({ currentTargetReps: 6, currentWorkingWeightKg: 60, totalSessions: 2, weightAtFailureStartKg: null });
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: ["barbell"] },
    "kg"
  );
  
  const decision = evaluateProgression({
    sets: [{ reps: 12, weightKg: 60, durationSeconds: null }, { reps: 12, weightKg: 60, durationSeconds: null }, { reps: 12, weightKg: 60, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "squat",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Stored 6: 3x12 (plan max) succeeds", decision.outcome === "progressed");
  
  // Below-target check: 3x11 should NOT progress
  check("Stored 6: 3x11 (below plan max) does NOT progress", evaluateProgression({
    sets: [{ reps: 11, weightKg: 60, durationSeconds: null }, { reps: 11, weightKg: 60, durationSeconds: null }, { reps: 11, weightKg: 60, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "squat",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

// Case 12: Stored 0 → uses plan min
console.log("\n12. Stored 0 → shows plan min");
{
  const row: SessionExerciseInput = {
    id: "se_stored_zero",
    planned_sets: 3,
    planned_reps_min: 5,
    planned_reps_max: 8,
    metric: "reps",
    rest_seconds: 150,
    status: "pending",
    feel: null,
    exercises: {
      id: "deadlift_exercise",
      name: "Deadlift",
      cue: null,
      movement_pattern: "hinge",
      mechanic: "compound",
      primary_muscles: ["glutes", "hamstrings"],
      equipment_ids: ["barbell"],
    },
    session_sets: [],
  };
  
  const progress = { current_target_reps: 0, current_working_weight_kg: 100 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  check("Stored 0: display shows plan range 5-8", runner.repsMin === 5 && runner.repsMax === 8);
  
  // Progression check: 3x8 (plan max) should progress
  const state = fresh({ currentTargetReps: 0, currentWorkingWeightKg: 100, totalSessions: 1, weightAtFailureStartKg: null });
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] }, "kg");
  
  const decision = evaluateProgression({
    sets: [{ reps: 8, weightKg: 100, durationSeconds: null }, { reps: 8, weightKg: 100, durationSeconds: null }, { reps: 8, weightKg: 100, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 5,
    repsMax: 8,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Stored 0: 3x8 (plan max) succeeds", decision.outcome === "progressed");
  
  // Below-target check: 3x7 should NOT progress
  check("Stored 0: 3x7 (below plan max) does NOT progress", evaluateProgression({
    sets: [{ reps: 7, weightKg: 100, durationSeconds: null }, { reps: 7, weightKg: 100, durationSeconds: null }, { reps: 7, weightKg: 100, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 5,
    repsMax: 8,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "hinge",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

// Case 13: Weighted pull-ups (pull_up_bar + dip_belt)
console.log("\n13. Weighted pull-ups (pull_up_bar + dip_belt)");
{
  const row: SessionExerciseInput = {
    id: "se_weighted_pullups",
    planned_sets: 3,
    planned_reps_min: 5,
    planned_reps_max: 8,
    metric: "reps",
    rest_seconds: 150,
    status: "pending",
    feel: null,
    exercises: {
      id: "weighted_pullups_exercise",
      name: "Weighted Pull-Ups",
      cue: null,
      movement_pattern: "vertical_pull",
      mechanic: "compound",
      primary_muscles: ["lats", "biceps"],
      equipment_ids: ["pull_up_bar", "dip_belt"],
    },
    session_sets: [],
  };
  
  const progress = { current_target_reps: 8, current_working_weight_kg: 10 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  check("Weighted pull-ups: display shows 8", runner.repsMax === 8);
  
  const state = fresh({ currentTargetReps: 8, currentWorkingWeightKg: 10, totalSessions: 8, weightAtFailureStartKg: null });
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: ["pull_up_bar", "dip_belt"] },
    "kg"
  );
  
  const decision = evaluateProgression({
    sets: [{ reps: 8, weightKg: 10, durationSeconds: null }, { reps: 8, weightKg: 10, durationSeconds: null }, { reps: 8, weightKg: 10, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 5,
    repsMax: 8,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_pull",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Weighted pull-ups: 3x8@10kg succeeds", decision.outcome === "progressed");
  check("Weighted pull-ups: 3x7@10kg does NOT succeed", evaluateProgression({
    sets: [{ reps: 7, weightKg: 10, durationSeconds: null }, { reps: 7, weightKg: 10, durationSeconds: null }, { reps: 7, weightKg: 10, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 5,
    repsMax: 8,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_pull",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

// Case 14: Chin-ups stored 11 on 8-12 range → must progress at 11, not stay
console.log("\n14. Chin-ups stored 11 on 8-12 range → 11 progresses");
{
  const row: SessionExerciseInput = {
    id: "se_chinups",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    rest_seconds: 150,
    status: "pending",
    feel: null,
    exercises: {
      id: "chinups_exercise",
      name: "Chin-Ups",
      cue: null,
      movement_pattern: "vertical_pull",
      mechanic: "compound",
      primary_muscles: ["lats", "biceps"],
      equipment_ids: ["pull_up_bar"],
    },
    session_sets: [],
  };
  
  const progress = { current_working_weight_kg: null, current_target_reps: 11 };
  const runner = buildRunnerExercise({
    row,
    progress,
    remembersWeights: true,
    isDeload: false,
  });
  check("Chin-ups: display shows 11", runner.repsMax === 11);
  
  const state = fresh({ 
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    totalSessions: 7 
  });
  const progInputs = progressionInputsFromExercise(
    { equipment_ids: ["pull_up_bar"] },
    "kg"
  );
  
  const decision = evaluateProgression({
    sets: [{ reps: 11, weightKg: null, durationSeconds: null }, { reps: 11, weightKg: null, durationSeconds: null }, { reps: 11, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_pull",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  check("Chin-ups: 3x11 PROGRESSES (not 'stay until top')", decision.outcome === "progressed");
  check("Chin-ups: message does NOT say 'staying'", !(decision.message?.toLowerCase().includes("staying")));
  check("Chin-ups: 3x10 does NOT progress", evaluateProgression({
    sets: [{ reps: 10, weightKg: null, durationSeconds: null }, { reps: 10, weightKg: null, durationSeconds: null }, { reps: 10, weightKg: null, durationSeconds: null }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: {
      mechanic: "compound",
      movementPattern: "vertical_pull",
      metric: "reps",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  }).outcome !== "progressed");
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL CONSISTENCY TESTS PASSED\n");
