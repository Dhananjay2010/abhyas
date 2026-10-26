#!/usr/bin/env tsx
/**
 * Test: Zero-weight progression through real buildProgressionInput path
 * 
 * MED-1: Tests bar, band, and medicine ball floor logic with actual
 * DB row simulation through buildProgressionInput.
 */

import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("Real-path zero-weight progression tests\n");

// Helper to create DB rows
function makeSessionExercise(equipmentIds: string[]) {
  return {
    id: "se1",
    session_id: "s1",
    exercise_id: "e1",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps" as const,
    exercises: {
      mechanic: "compound" as const,
      movement_pattern: "vertical_pull" as const,
      equipment_ids: equipmentIds,
      progression_chain: null,
      progression_rank: null,
    },
  };
}

const session = {
  is_deload: false,
  local_date: "2026-10-26",
  program_id: "p1",
};

// Pull-up bar: metric, third miss → 0
console.log("1. Pull-up bar (metric) third miss → 0");
const barMetricSets = [
  { reps: 7, weight_kg: "2.5", duration_seconds: null },
  { reps: 6, weight_kg: "2.5", duration_seconds: null },
];
const barMetricProgress = {
  current_working_weight_kg: "2.5",
  current_target_reps: 12,
  consecutive_failures: 2,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
const barMetricInput = buildProgressionInput(
  makeSessionExercise(["pull_up_bar"]),
  barMetricSets,
  barMetricProgress,
  session,
  null,
  "metric"
);
const barMetricResult = evaluateProgression(barMetricInput);
console.log(`  Message: "${barMetricResult.message}"`);
console.log(`  Next weight: ${barMetricResult.nextWorkingWeightKg} kg`);
check("Bar metric reaches 0", barMetricResult.nextWorkingWeightKg === 0, `got: ${barMetricResult.nextWorkingWeightKg}`);
check("Bar metric says 'dropping to bodyweight'", barMetricResult.message.includes("dropping to bodyweight"), barMetricResult.message);
check("Bar metric has no '0 kg'", !barMetricResult.message.includes("0 kg"), barMetricResult.message);
check("Bar metric has no '0 lb'", !barMetricResult.message.includes("0 lb"), barMetricResult.message);
console.log();

// Pull-up bar: imperial
console.log("2. Pull-up bar (imperial) third miss → 0");
const barImperialInput = buildProgressionInput(
  makeSessionExercise(["pull_up_bar"]),
  barMetricSets,
  barMetricProgress,
  session,
  null,
  "imperial"
);
const barImperialResult = evaluateProgression(barImperialInput);
console.log(`  Message: "${barImperialResult.message}"`);
check("Bar imperial reaches 0", barImperialResult.nextWorkingWeightKg === 0, `got: ${barImperialResult.nextWorkingWeightKg}`);
check("Bar imperial says 'dropping to bodyweight'", barImperialResult.message.includes("dropping to bodyweight"), barImperialResult.message);
check("Bar imperial has no '0 kg'", !barImperialResult.message.includes("0 kg"), barImperialResult.message);
check("Bar imperial has no '0 lb'", !barImperialResult.message.includes("0 lb"), barImperialResult.message);
console.log();

// Resistance band: metric, third miss → 0
console.log("3. Resistance band (metric) third miss → 0");
const bandInput = buildProgressionInput(
  makeSessionExercise(["resistance_band"]),
  barMetricSets,
  barMetricProgress,
  session,
  null,
  "metric"
);
const bandResult = evaluateProgression(bandInput);
console.log(`  Message: "${bandResult.message}"`);
check("Band metric reaches 0", bandResult.nextWorkingWeightKg === 0, `got: ${bandResult.nextWorkingWeightKg}`);
check("Band metric says 'dropping to no band'", bandResult.message.includes("dropping to no band"), bandResult.message);
check("Band metric has no '0 kg'", !bandResult.message.includes("0 kg"), bandResult.message);
check("Band metric has no '0 lb'", !bandResult.message.includes("0 lb"), bandResult.message);
console.log();

// Resistance band: imperial
console.log("4. Resistance band (imperial) third miss → 0");
const bandImperialInput = buildProgressionInput(
  makeSessionExercise(["resistance_band"]),
  barMetricSets,
  barMetricProgress,
  session,
  null,
  "imperial"
);
const bandImperialResult = evaluateProgression(bandImperialInput);
console.log(`  Message: "${bandImperialResult.message}"`);
check("Band imperial reaches 0", bandImperialResult.nextWorkingWeightKg === 0, `got: ${bandImperialResult.nextWorkingWeightKg}`);
check("Band imperial says 'dropping to no band'", bandImperialResult.message.includes("dropping to no band"), bandImperialResult.message);
check("Band imperial has no '0 kg'", !bandImperialResult.message.includes("0 kg"), bandImperialResult.message);
check("Band imperial has no '0 lb'", !bandImperialResult.message.includes("0 lb"), bandImperialResult.message);
console.log();

// Medicine ball: metric, at lightest ball (3 kg), third miss → hold
console.log("5. Medicine ball (metric) at 3 kg, third miss → hold");
const ballMetricSets = [
  { reps: 7, weight_kg: "3", duration_seconds: null },
  { reps: 6, weight_kg: "3", duration_seconds: null },
];
const ballMetricProgress = {
  current_working_weight_kg: "3",
  current_target_reps: 12,
  consecutive_failures: 2,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
const ballMetricInput = buildProgressionInput(
  makeSessionExercise(["medicine_ball"]),
  ballMetricSets,
  ballMetricProgress,
  session,
  null,
  "metric"
);
const ballMetricResult = evaluateProgression(ballMetricInput);
console.log(`  Message: "${ballMetricResult.message}"`);
console.log(`  Next weight: ${ballMetricResult.nextWorkingWeightKg} kg`);
console.log(`  Outcome: ${ballMetricResult.outcome}`);
check("Ball metric holds at 3", ballMetricResult.nextWorkingWeightKg === 3, `got: ${ballMetricResult.nextWorkingWeightKg}`);
check("Ball metric outcome is hold", ballMetricResult.outcome === "hold", `got: ${ballMetricResult.outcome}`);
check("Ball metric says 'Staying at 3 kg'", ballMetricResult.message.includes("Staying at 3 kg"), ballMetricResult.message);
check("Ball metric says 'aim for clean reps'", ballMetricResult.message.includes("aim for clean reps"), ballMetricResult.message);
check("Ball metric has no '0 kg'", !ballMetricResult.message.includes("0 kg"), ballMetricResult.message);
check("Ball metric has no '0 lb'", !ballMetricResult.message.includes("0 lb"), ballMetricResult.message);
console.log();

// Medicine ball: imperial, at lightest ball (3 kg), third miss → hold
console.log("6. Medicine ball (imperial) at 3 kg, third miss → hold");
const ballImperialInput = buildProgressionInput(
  makeSessionExercise(["medicine_ball"]),
  ballMetricSets,
  ballMetricProgress,
  session,
  null,
  "imperial"
);
const ballImperialResult = evaluateProgression(ballImperialInput);
console.log(`  Message: "${ballImperialResult.message}"`);
check("Ball imperial holds at 3", ballImperialResult.nextWorkingWeightKg === 3, `got: ${ballImperialResult.nextWorkingWeightKg}`);
check("Ball imperial outcome is hold", ballImperialResult.outcome === "hold", `got: ${ballImperialResult.outcome}`);
check("Ball imperial says 'Staying at 6.5 lb'", ballImperialResult.message.includes("Staying at 6.5 lb"), ballImperialResult.message);
check("Ball imperial says 'aim for clean reps'", ballImperialResult.message.includes("aim for clean reps"), ballImperialResult.message);
check("Ball imperial has no '0 kg'", !ballImperialResult.message.includes("0 kg"), ballImperialResult.message);
check("Ball imperial has no '0 lb'", !ballImperialResult.message.includes("0 lb"), ballImperialResult.message);
console.log();

// Medicine ball: metric, above lightest (5 kg), third miss → drops to 4
console.log("7. Medicine ball (metric) at 5 kg, third miss → 4 kg");
const ball5kgSets = [
  { reps: 7, weight_kg: "5", duration_seconds: null },
  { reps: 6, weight_kg: "5", duration_seconds: null },
];
const ball5kgProgress = {
  current_working_weight_kg: "5",
  current_target_reps: 12,
  consecutive_failures: 2,
  best_weight_kg: "7",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
const ball5kgInput = buildProgressionInput(
  makeSessionExercise(["medicine_ball"]),
  ball5kgSets,
  ball5kgProgress,
  session,
  null,
  "metric"
);
const ball5kgResult = evaluateProgression(ball5kgInput);
console.log(`  Message: "${ball5kgResult.message}"`);
console.log(`  Next weight: ${ball5kgResult.nextWorkingWeightKg} kg`);
check("Ball 5kg drops to 4", ball5kgResult.nextWorkingWeightKg === 4, `got: ${ball5kgResult.nextWorkingWeightKg}`);
check("Ball 5kg says '4 kg'", ball5kgResult.message.includes("4 kg"), ball5kgResult.message);
check("Ball 5kg has no '0 kg'", !ball5kgResult.message.includes("0 kg"), ball5kgResult.message);
console.log();

// Medicine ball: imperial
console.log("8. Medicine ball (imperial) at 5 kg, third miss → 4 kg");
const ball5kgImperialInput = buildProgressionInput(
  makeSessionExercise(["medicine_ball"]),
  ball5kgSets,
  ball5kgProgress,
  session,
  null,
  "imperial"
);
const ball5kgImperialResult = evaluateProgression(ball5kgImperialInput);
console.log(`  Message: "${ball5kgImperialResult.message}"`);
check("Ball 5kg imperial drops to 4", ball5kgImperialResult.nextWorkingWeightKg === 4, `got: ${ball5kgImperialResult.nextWorkingWeightKg}`);
check("Ball 5kg imperial shows lb", ball5kgImperialResult.message.includes("lb"), ball5kgImperialResult.message);
check("Ball 5kg imperial has no '0 kg'", !ball5kgImperialResult.message.includes("0 kg"), ball5kgImperialResult.message);
check("Ball 5kg imperial has no '0 lb'", !ball5kgImperialResult.message.includes("0 lb"), ball5kgImperialResult.message);
console.log();

console.log("=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - Zero-weight floor logic through real path");
  console.log("Kills mutants: H5, Z1, BALL-FLOOR");
  process.exit(0);
}
