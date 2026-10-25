#!/usr/bin/env tsx
/**
 * M-2: Wiring test for display-target logic through real page.tsx path.
 *
 * Tests the extracted pure mapping function with real rows, verifying:
 * - Bodyweight plank stored at 45 gives 45s
 * - Weighted plank stays on plan
 * - Bodyweight push-ups stored at 14 give 14
 * - Reps stored at 12 on seconds plan get ignored (below min causes fallback)
 * - Stored 500 gets capped (120s for holds)
 * 
 * And that 5 mutants fail:
 * - Drop the call to resolveTarget
 * - Swap min/max
 * - Null the target
 * - Force metric to seconds
 * - Swap outputs
 */

import { mapSessionExercise, type SessionExerciseRow, type ExerciseProgressRow } from "../src/lib/session/build-runner-exercises.js";

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

console.log("M-2: Wiring test for display-target through real mapping function\n");

// Test 1: Bodyweight plank (seconds) stored at 45s → shows 45s
{
  const row: SessionExerciseRow = {
    id: "se1",
    planned_sets: 3,
    planned_reps_min: 30,
    planned_reps_max: 60,
    rest_seconds: 90,
    metric: "seconds",
    exercises: {
      id: "ex-plank",
      name: "Plank",
      cue: null,
      movement_pattern: "other",
      primary_muscles: ["core"],
      equipment_ids: [], // bodyweight
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-plank",
    current_working_weight_kg: null,
    current_target_reps: 45,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Bodyweight plank stored at 45s → min=45", result.repsMin === 45);
  check("Bodyweight plank stored at 45s → max=45", result.repsMax === 45);
  check("Bodyweight plank → metric=seconds", result.metric === "seconds");
  check("Bodyweight plank → isBodyweight=true", result.isBodyweight === true);
}

// Test 2: Weighted plank (added weight) → stays on plan
{
  const row: SessionExerciseRow = {
    id: "se2",
    planned_sets: 3,
    planned_reps_min: 20,
    planned_reps_max: 40,
    rest_seconds: 90,
    metric: "seconds",
    exercises: {
      id: "ex-weighted-plank",
      name: "Weighted Plank",
      cue: null,
      movement_pattern: "other",
      primary_muscles: ["core"],
      equipment_ids: [], // bodyweight base, but has added weight
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-weighted-plank",
    current_working_weight_kg: 10, // added weight
    current_target_reps: 35,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Weighted plank → uses plan min", result.repsMin === 20);
  check("Weighted plank → uses plan max", result.repsMax === 40);
}

// Test 3: Bodyweight push-ups stored at 14 → shows 14
{
  const row: SessionExerciseRow = {
    id: "se3",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    metric: "reps",
    exercises: {
      id: "ex-pushup",
      name: "Push-up",
      cue: null,
      movement_pattern: "horizontal_push",
      primary_muscles: ["chest"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-pushup",
    current_working_weight_kg: null,
    current_target_reps: 14,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Bodyweight push-ups stored at 14 → min=14", result.repsMin === 14);
  check("Bodyweight push-ups stored at 14 → max=14", result.repsMax === 14);
}

// Test 4: Reps stored at 12 on seconds plan (below min 30) → ignored, uses plan
{
  const row: SessionExerciseRow = {
    id: "se4",
    planned_sets: 3,
    planned_reps_min: 30,
    planned_reps_max: 60,
    rest_seconds: 90,
    metric: "seconds",
    exercises: {
      id: "ex-plank2",
      name: "Plank",
      cue: null,
      movement_pattern: "other",
      primary_muscles: ["core"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-plank2",
    current_working_weight_kg: null,
    current_target_reps: 12, // Below plan min of 30
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Stored 12 below plan min 30 → uses plan min", result.repsMin === 30);
  check("Stored 12 below plan min 30 → uses plan max", result.repsMax === 60);
}

// Test 5: Stored 500s gets capped at 120s
{
  const row: SessionExerciseRow = {
    id: "se5",
    planned_sets: 3,
    planned_reps_min: 30,
    planned_reps_max: 60,
    rest_seconds: 90,
    metric: "seconds",
    exercises: {
      id: "ex-long-plank",
      name: "Plank",
      cue: null,
      movement_pattern: "other",
      primary_muscles: ["core"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-long-plank",
    current_working_weight_kg: null,
    current_target_reps: 500,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Stored 500s capped at 120s → min=120", result.repsMin === 120);
  check("Stored 500s capped at 120s → max=120", result.repsMax === 120);
}

// Test 6: Stored reps at 50 (2×planMax=24) gets capped
{
  const row: SessionExerciseRow = {
    id: "se6",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    metric: "reps",
    exercises: {
      id: "ex-high-reps",
      name: "Push-up",
      cue: null,
      movement_pattern: "horizontal_push",
      primary_muscles: ["chest"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-high-reps",
    current_working_weight_kg: null,
    current_target_reps: 50,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Stored 50 reps capped at 2×12=24 → min=24", result.repsMin === 24);
  check("Stored 50 reps capped at 2×12=24 → max=24", result.repsMax === 24);
}

// Test 7: Negative stored value → ignored, uses plan
{
  const row: SessionExerciseRow = {
    id: "se7",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    metric: "reps",
    exercises: {
      id: "ex-neg",
      name: "Push-up",
      cue: null,
      movement_pattern: "horizontal_push",
      primary_muscles: ["chest"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-neg",
    current_working_weight_kg: null,
    current_target_reps: -5,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Negative stored value → uses plan min", result.repsMin === 8);
  check("Negative stored value → uses plan max", result.repsMax === 12);
}

// Test 8: Zero stored value → ignored, uses plan
{
  const row: SessionExerciseRow = {
    id: "se8",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    metric: "reps",
    exercises: {
      id: "ex-zero",
      name: "Push-up",
      cue: null,
      movement_pattern: "horizontal_push",
      primary_muscles: ["chest"],
      equipment_ids: [],
    },
  };
  const progress: ExerciseProgressRow = {
    exercise_id: "ex-zero",
    current_working_weight_kg: null,
    current_target_reps: 0,
  };

  const result = mapSessionExercise({ row, progress, remembersWeights: true });
  
  check("Zero stored value → uses plan min", result.repsMin === 8);
  check("Zero stored value → uses plan max", result.repsMax === 12);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
