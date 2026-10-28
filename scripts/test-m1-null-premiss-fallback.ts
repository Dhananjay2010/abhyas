#!/usr/bin/env tsx
/**
 * M1 read path test: Verifies that weight_at_failure_start_kg is correctly
 * read from the database row and used in the second-miss back-off calculation.
 * 
 * Kills mutant M1e (input builder ignores weight_at_failure_start_kg).
 */

import { buildProgressionInput, type SessionExerciseRow, type ExerciseProgressRow, type SessionRow } from "@/lib/session/build-progression-input";
import { evaluateProgression } from "@/lib/program/progression";

console.log("Testing M1 read path (weight_at_failure_start_kg from DB row)...\n");

// Mock database row with weight_at_failure_start_kg set to 20 kg
// Simulates state after first miss: weight dropped from 20 to 17.5, counter = 1
const mockProgress: ExerciseProgressRow = {
  current_working_weight_kg: 17.5,
  current_target_reps: 12,
  consecutive_failures: 1,
  best_weight_kg: 20,
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 2,
  weight_at_failure_start_kg: 20, // M1: This is the key field being tested
};

const mockSessionExercise: SessionExerciseRow = {
  id: "test-se-id",
  session_id: "test-session-id",
  exercise_id: "test-exercise-id",
  planned_sets: 3,
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

const mockSession: SessionRow = {
  is_deload: false,
  local_date: "2024-01-16",
  program_id: "test-program-id",
};

const missingSets = [
  { reps: 5, weight_kg: 17.5, duration_seconds: null },
  { reps: 4, weight_kg: 17.5, duration_seconds: null },
  { reps: 3, weight_kg: 17.5, duration_seconds: null },
];

// Build progression input (this is the M1 read path being tested)
const input = buildProgressionInput(
  mockSessionExercise,
  missingSets,
  mockProgress,
  mockSession,
  null
);

console.log("Input state after buildProgressionInput:");
console.log(`  currentWorkingWeightKg: ${input.state.currentWorkingWeightKg} kg`);
console.log(`  consecutiveFailures: ${input.state.consecutiveFailures}`);
console.log(`  weightAtFailureStartKg: ${input.state.weightAtFailureStartKg} kg\n`);

// Verify weightAtFailureStartKg was read correctly from the DB row
if (input.state.weightAtFailureStartKg !== 20) {
  console.error("❌ FAIL: weightAtFailureStartKg not read from DB row");
  console.error(`  Expected: 20, Got: ${input.state.weightAtFailureStartKg}`);
  console.error("  This means mutant M1e is alive!");
  process.exit(1);
}

console.log("✓ weightAtFailureStartKg correctly read: 20 kg\n");

// Simulate second miss and verify it uses the stored pre-miss weight (20) for back-off
const decision = evaluateProgression(input);

console.log("Second miss decision:");
console.log(`  Next weight: ${decision.nextWorkingWeightKg} kg`);
console.log(`  Outcome: ${decision.outcome}`);
console.log(`  Message: ${decision.message}\n`);

// Expected: 10% of 20 kg = 18 kg, snapped to barbell grid (2.5 kg) = 17.5 kg or holds at 17.5
// If M1e mutant is alive (ignoring weightAtFailureStartKg), it would use 17.5 kg for back-off,
// giving 10% of 17.5 = 15.75, snapped to 15 kg
const expectedWeight = 17.5; // 10% reduction from 20 kg (or hold)
const wrongWeight = 15; // 10% reduction from 17.5 kg (mutant behavior)

if (decision.nextWorkingWeightKg === wrongWeight) {
  console.error("❌ FAIL: Used currentWorkingWeightKg (17.5) instead of weightAtFailureStartKg (20)");
  console.error("  This means mutant M1e is alive!");
  process.exit(1);
}

if (decision.nextWorkingWeightKg !== expectedWeight) {
  console.error(`❌ FAIL: Unexpected weight ${decision.nextWorkingWeightKg} kg`);
  console.error(`  Expected: ${expectedWeight} kg (from 20 kg pre-miss weight)`);
  process.exit(1);
}

console.log("✓ Second-miss back-off correctly used pre-miss weight (20 kg)");
console.log("✓ M1 read path test passed - mutant M1e is killed\n");
process.exit(0);

