#!/usr/bin/env tsx
import { buildRunnerExercise } from "../src/lib/session/build-runner-exercises";
import type { SessionExerciseInput, ProgressInput } from "../src/lib/session/build-runner-exercises";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log("  " + (pass ? "✓" : "✗") + " " + label + (detail ? "  -- " + detail : ""));
}

console.log("\n=== M1 Loader Test ===\n");
console.log("Case 1: Increase 60 kg → 62.5 kg");
{
  const sessionExercise: SessionExerciseInput = {
    id: "se1", planned_sets: 3, planned_reps_min: 6, planned_reps_max: 8,
    rest_seconds: 180, status: "pending", feel: null, metric: "reps",
    exercises: { id: "ex1", name: "Bench", cue: null, movement_pattern: "horizontal_press",
      primary_muscles: ["chest"], equipment_ids: ["barbell"] },
    session_sets: []
  };
  const progress: ProgressInput = {
    current_working_weight_kg: 62.5, current_target_reps: 8, previous_completed_weight_kg: 60
  };
  const result = buildRunnerExercise({ row: sessionExercise, progress, remembersWeights: true, isDeload: false });
  check("Previous is 60 kg", result.previousCompletedWeightKg === 60, "got " + result.previousCompletedWeightKg);
  const isIncrease = result.suggestedWeightKg !== null && result.previousCompletedWeightKg !== null &&
    result.suggestedWeightKg > result.previousCompletedWeightKg + 0.01;
  check("Detected as increase", isIncrease);
}

console.log("\nCase 2: Held 62.5 kg → 62.5 kg");
{
  const sessionExercise: SessionExerciseInput = {
    id: "se2", planned_sets: 3, planned_reps_min: 6, planned_reps_max: 8,
    rest_seconds: 180, status: "pending", feel: null, metric: "reps",
    exercises: { id: "ex2", name: "Squat", cue: null, movement_pattern: "squat",
      primary_muscles: ["quads"], equipment_ids: ["barbell"] },
    session_sets: []
  };
  const progress: ProgressInput = {
    current_working_weight_kg: 62.5, current_target_reps: 8, previous_completed_weight_kg: 62.5
  };
  const result = buildRunnerExercise({ row: sessionExercise, progress, remembersWeights: true, isDeload: false });
  check("Previous is 62.5 kg", result.previousCompletedWeightKg === 62.5, "got " + result.previousCompletedWeightKg);
  const isIncrease = result.suggestedWeightKg !== null && result.previousCompletedWeightKg !== null &&
    result.suggestedWeightKg > result.previousCompletedWeightKg + 0.01;
  check("NOT detected as increase", !isIncrease);
}

if (failures === 0) {
  console.log("\n✓ All M1 loader tests passed\n");
  process.exit(0);
} else {
  console.log("\n✗ " + failures + " test(s) failed\n");
  process.exit(1);
}
