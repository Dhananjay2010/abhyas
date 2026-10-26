#!/usr/bin/env tsx
import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

const sessionExercise = {
  id: "se-1",
  session_id: "s-1",
  exercise_id: "e-1",
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
  { reps: 12, weight_kg: "70", duration_seconds: null },
  { reps: 12, weight_kg: "72.5", duration_seconds: null },
  { reps: 11, weight_kg: "72.5", duration_seconds: null },
];

const progress = {
  current_working_weight_kg: "72.35",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "72.35",
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

const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "metric");
console.log("Input:", JSON.stringify(input, null, 2));

const decision = evaluateProgression(input);
console.log("\nDecision:", JSON.stringify(decision, null, 2));
