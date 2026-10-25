#!/usr/bin/env tsx
/**
 * Debug: Compare buildProgressionInput output with direct call
 */

import { evaluateProgression } from "../src/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "../src/lib/session/build-progression-input";

const sessionExercise: SessionExerciseRow = {
  id: "se-2",
  session_id: "sess-2",
  exercise_id: "ex-bench",
  planned_sets: 4,
  planned_reps_min: 8,
  planned_reps_max: 12,
  metric: "reps",
  exercises: {
    mechanic: "compound",
    movement_pattern: "horizontal_press",
    equipment_ids: ["barbell"],
    progression_chain: null,
    progression_rank: null,
  },
};

const sets: SessionSetRow[] = [
  { reps: 7, weight_kg: "60", duration_seconds: null },
  { reps: 7, weight_kg: "60", duration_seconds: null },
  { reps: 7, weight_kg: "60", duration_seconds: null },
  { reps: 7, weight_kg: "60", duration_seconds: null },
];

const progress: ExerciseProgressRow = {
  current_working_weight_kg: "60",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "60",
  best_reps: 12,
  best_e1rm: "84",
  total_sessions: 2,
};

const session: SessionRow = {
  is_deload: false,
  local_date: "2026-10-25",
  program_id: "prog-1",
};

console.log("=== Testing 4×7 (should be a miss, drop to 57.5) ===\n");

console.log("1. Via buildProgressionInput:");
const inputFromBuilder = buildProgressionInput(sessionExercise, sets, progress, session, "right");
console.log(JSON.stringify(inputFromBuilder, null, 2));

const decision1 = evaluateProgression(inputFromBuilder);
console.log("\nDecision:");
console.log("  Outcome:", decision1.outcome);
console.log("  Next weight:", decision1.nextWorkingWeightKg);
console.log("  Failures:", decision1.consecutiveFailures);
console.log("  Message:", decision1.message);

console.log("\n2. Direct call (same params):");
const inputDirect = {
  sets: [
    { reps: 7, weightKg: 60, durationSeconds: null },
    { reps: 7, weightKg: 60, durationSeconds: null },
    { reps: 7, weightKg: 60, durationSeconds: null },
    { reps: 7, weightKg: 60, durationSeconds: null },
  ],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right" as const,
  meta: {
    mechanic: "compound" as const,
    movementPattern: "horizontal_press" as const,
    metric: "reps" as const,
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  },
  state: {
    currentWorkingWeightKg: 60,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 60,
    bestReps: 12,
    bestE1rm: 84,
    totalSessions: 2,
  },
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg" as const,
};

console.log(JSON.stringify(inputDirect, null, 2));

const decision2 = evaluateProgression(inputDirect);
console.log("\nDecision:");
console.log("  Outcome:", decision2.outcome);
console.log("  Next weight:", decision2.nextWorkingWeightKg);
console.log("  Failures:", decision2.consecutiveFailures);
console.log("  Message:", decision2.message);

console.log("\n3. Key differences:");
console.log("  repsMin:", inputFromBuilder.repsMin, "vs", inputDirect.repsMin);
console.log("  repsMax:", inputFromBuilder.repsMax, "vs", inputDirect.repsMax);
console.log("  sets length:", inputFromBuilder.sets.length, "vs", inputDirect.sets.length);
console.log("  sets[0].reps:", inputFromBuilder.sets[0]?.reps, "vs", inputDirect.sets[0]?.reps);
console.log("  equipmentIds:", inputFromBuilder.equipmentIds, "vs", inputDirect.equipmentIds);
console.log("  unit:", inputFromBuilder.unit, "vs", inputDirect.unit);
