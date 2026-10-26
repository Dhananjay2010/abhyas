#!/usr/bin/env tsx
import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

console.log("Barbell 72.3 kg (imperial):");
{
  const sessionExercise = {
    id: "se-3",
    session_id: "s-3",
    exercise_id: "e-3",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps" as const,
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "horizontal_press" as const,
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
  };

  const sets = [
    { reps: 12, weight_kg: "72.5", duration_seconds: null },
    { reps: 12, weight_kg: "72.5", duration_seconds: null },
    { reps: 12, weight_kg: "72.5", duration_seconds: null },
  ];

  const progress = {
    current_working_weight_kg: "72.3",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "72.3",
    best_reps: 12,
    best_e1rm: 101.8,
    total_sessions: 10,
    weight_at_failure_start_kg: null,
  };

  const session = {
    is_deload: false,
    local_date: "2026-10-26",
    program_id: "prog-1",
  };

  const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "imperial");
  const decision = evaluateProgression(input);

  if (!decision.nextWorkingWeightKg) throw new Error("nextWorkingWeightKg is null");
  console.log("Next weight:", decision.nextWorkingWeightKg, "kg =", decision.nextWorkingWeightKg * 2.20462, "lb");
  console.log("Message:", decision.message);
}

console.log("\nDumbbell 65.77 kg (imperial):");
{
  const sessionExercise = {
    id: "se-4",
    session_id: "s-4",
    exercise_id: "e-4",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps" as const,
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "horizontal_press" as const,
      equipment_ids: ["dumbbell"],
      progression_chain: null,
      progression_rank: null,
    },
  };

  const sets = [
    { reps: 12, weight_kg: "67.5", duration_seconds: null },
    { reps: 12, weight_kg: "67.5", duration_seconds: null },
    { reps: 12, weight_kg: "67.5", duration_seconds: null },
  ];

  const progress = {
    current_working_weight_kg: "65.77",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "65.77",
    best_reps: 12,
    best_e1rm: 92.6,
    total_sessions: 8,
    weight_at_failure_start_kg: null,
  };

  const session = {
    is_deload: false,
    local_date: "2026-10-26",
    program_id: "prog-1",
  };

  const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "imperial");
  const decision = evaluateProgression(input);

  if (!decision.nextWorkingWeightKg) throw new Error("nextWorkingWeightKg is null");
  console.log("Next weight:", decision.nextWorkingWeightKg, "kg =", decision.nextWorkingWeightKg * 2.20462, "lb");
  console.log("Message:", decision.message);
}
