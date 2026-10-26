#!/usr/bin/env tsx
/**
 * Test: Zero-weight progression through real buildProgressionInput path
 * 
 * MED-1: Sequential tests for bar, band, and medicine ball floor logic
 * with actual DB row simulation through buildProgressionInput.
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

console.log("Sequential real-path zero-weight progression tests\n");

// Helper to create DB rows
const mechanicCompound: "compound" = "compound";
const movementVerticalPull: "vertical_pull" = "vertical_pull";
const metricReps: "reps" = "reps";

function makeSessionExercise(equipmentIds: string[]) {
  return {
    id: "se1",
    session_id: "s1",
    exercise_id: "e1",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: metricReps,
    exercises: {
      mechanic: mechanicCompound,
      movement_pattern: movementVerticalPull,
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

// Pull-up bar: metric, sequential misses 1 → 2 → 3 → 0
console.log("1. Pull-up bar (metric) sequential misses → 0");
let barProgress: {
  current_working_weight_kg: string;
  current_target_reps: number;
  consecutive_failures: number;
  best_weight_kg: string;
  best_reps: number;
  best_e1rm: null;
  total_sessions: number;
  weight_at_failure_start_kg: string | null;
} = {
  current_working_weight_kg: "2.5",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
const barSe = makeSessionExercise(["pull_up_bar"]);

// Miss 1
let barSets = [
  { reps: 7, weight_kg: "2.5", duration_seconds: null },
  { reps: 6, weight_kg: "2.5", duration_seconds: null },
];
let barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "metric");
let barResult = evaluateProgression(barInput);
console.log(`  Miss 1: ${barResult.nextWorkingWeightKg} kg, cf=${barResult.consecutiveFailures}, msg="${barResult.message}"`);
check("Miss 1: still at 2.5", barResult.nextWorkingWeightKg === 2.5, `got: ${barResult.nextWorkingWeightKg}`);
check("Miss 1: cf=1", barResult.consecutiveFailures === 1, `got: ${barResult.consecutiveFailures}`);

// Miss 2
barProgress = {
  ...barProgress,
  consecutive_failures: barResult.consecutiveFailures,
  current_working_weight_kg: String(barResult.nextWorkingWeightKg),
  weight_at_failure_start_kg: barResult.weightAtFailureStartKg !== null ? String(barResult.weightAtFailureStartKg) : null,
};
barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "metric");
barResult = evaluateProgression(barInput);
console.log(`  Miss 2: ${barResult.nextWorkingWeightKg} kg, cf=${barResult.consecutiveFailures}, msg="${barResult.message}"`);
check("Miss 2: cf=2", barResult.consecutiveFailures === 2, `got: ${barResult.consecutiveFailures}`);

// Miss 3 → 0
barProgress = {
  ...barProgress,
  consecutive_failures: barResult.consecutiveFailures,
  current_working_weight_kg: String(barResult.nextWorkingWeightKg),
  weight_at_failure_start_kg: barResult.weightAtFailureStartKg !== null ? String(barResult.weightAtFailureStartKg) : null,
};
barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "metric");
barResult = evaluateProgression(barInput);
console.log(`  Miss 3: ${barResult.nextWorkingWeightKg} kg, cf=${barResult.consecutiveFailures}, msg="${barResult.message}"`);
check("Miss 3: reaches 0", barResult.nextWorkingWeightKg === 0, `got: ${barResult.nextWorkingWeightKg}`);
check("Miss 3: says 'dropping to bodyweight'", barResult.message.includes("dropping to bodyweight"), barResult.message);
check("Miss 3: no '0 kg'", !barResult.message.includes("0 kg"), barResult.message);
console.log();

// Pull-up bar: imperial, sequential
console.log("2. Pull-up bar (imperial) sequential misses → 0");
barProgress = {
  current_working_weight_kg: "2.5",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
barSets = [
  { reps: 7, weight_kg: "2.5", duration_seconds: null },
  { reps: 6, weight_kg: "2.5", duration_seconds: null },
];
// Miss 1
barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "imperial");
barResult = evaluateProgression(barInput);
// Miss 2
barProgress.consecutive_failures = barResult.consecutiveFailures;
barProgress.current_working_weight_kg = String(barResult.nextWorkingWeightKg);
barProgress.weight_at_failure_start_kg = barResult.weightAtFailureStartKg !== null ? String(barResult.weightAtFailureStartKg) : null;
barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "imperial");
barResult = evaluateProgression(barInput);
// Miss 3 → 0
barProgress.consecutive_failures = barResult.consecutiveFailures;
barProgress.current_working_weight_kg = String(barResult.nextWorkingWeightKg);
barProgress.weight_at_failure_start_kg = barResult.weightAtFailureStartKg !== null ? String(barResult.weightAtFailureStartKg) : null;
barInput = buildProgressionInput(barSe, barSets, barProgress, session, null, "imperial");
barResult = evaluateProgression(barInput);
console.log(`  Imperial miss 3: ${barResult.nextWorkingWeightKg} kg, msg="${barResult.message}"`);
check("Imperial: reaches 0", barResult.nextWorkingWeightKg === 0, `got: ${barResult.nextWorkingWeightKg}`);
check("Imperial: says 'dropping to bodyweight'", barResult.message.includes("dropping to bodyweight"), barResult.message);
check("Imperial: no '0 lb'", !barResult.message.includes("0 lb"), barResult.message);
console.log();

// Resistance band: metric, sequential misses → 0
console.log("3. Resistance band (metric) sequential misses → 0");
const bandSe = makeSessionExercise(["resistance_band"]);
let bandProgress: {
  current_working_weight_kg: string;
  current_target_reps: number;
  consecutive_failures: number;
  best_weight_kg: string;
  best_reps: number;
  best_e1rm: null;
  total_sessions: number;
  weight_at_failure_start_kg: string | null;
} = {
  current_working_weight_kg: "2.5",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
let bandSets = [
  { reps: 7, weight_kg: "2.5", duration_seconds: null },
  { reps: 6, weight_kg: "2.5", duration_seconds: null },
];
let bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "metric");
let bandResult = evaluateProgression(bandInput);
// Miss 2
bandProgress.consecutive_failures = bandResult.consecutiveFailures;
bandProgress.current_working_weight_kg = String(bandResult.nextWorkingWeightKg);
bandProgress.weight_at_failure_start_kg = bandResult.weightAtFailureStartKg !== null ? String(bandResult.weightAtFailureStartKg) : null;
bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "metric");
bandResult = evaluateProgression(bandInput);
// Miss 3 → 0
bandProgress.consecutive_failures = bandResult.consecutiveFailures;
bandProgress.current_working_weight_kg = String(bandResult.nextWorkingWeightKg);
bandProgress.weight_at_failure_start_kg = bandResult.weightAtFailureStartKg !== null ? String(bandResult.weightAtFailureStartKg) : null;
bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "metric");
bandResult = evaluateProgression(bandInput);
console.log(`  Band miss 3: ${bandResult.nextWorkingWeightKg} kg, msg="${bandResult.message}"`);
check("Band: reaches 0", bandResult.nextWorkingWeightKg === 0, `got: ${bandResult.nextWorkingWeightKg}`);
check("Band: says 'dropping to no band'", bandResult.message.includes("dropping to no band"), bandResult.message);
check("Band: no '0 kg'", !bandResult.message.includes("0 kg"), bandResult.message);
console.log();

// Resistance band: imperial, sequential
console.log("4. Resistance band (imperial) sequential misses → 0");
bandProgress = {
  current_working_weight_kg: "2.5",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
bandSets = [
  { reps: 7, weight_kg: "2.5", duration_seconds: null },
  { reps: 6, weight_kg: "2.5", duration_seconds: null },
];
bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "imperial");
bandResult = evaluateProgression(bandInput);
// Miss 2
bandProgress.consecutive_failures = bandResult.consecutiveFailures;
bandProgress.current_working_weight_kg = String(bandResult.nextWorkingWeightKg);
bandProgress.weight_at_failure_start_kg = bandResult.weightAtFailureStartKg !== null ? String(bandResult.weightAtFailureStartKg) : null;
bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "imperial");
bandResult = evaluateProgression(bandInput);
// Miss 3 → 0
bandProgress.consecutive_failures = bandResult.consecutiveFailures;
bandProgress.current_working_weight_kg = String(bandResult.nextWorkingWeightKg);
bandProgress.weight_at_failure_start_kg = bandResult.weightAtFailureStartKg !== null ? String(bandResult.weightAtFailureStartKg) : null;
bandInput = buildProgressionInput(bandSe, bandSets, bandProgress, session, null, "imperial");
bandResult = evaluateProgression(bandInput);
console.log(`  Band imperial miss 3: ${bandResult.nextWorkingWeightKg} kg, msg="${bandResult.message}"`);
check("Band imperial: reaches 0", bandResult.nextWorkingWeightKg === 0, `got: ${bandResult.nextWorkingWeightKg}`);
check("Band imperial: says 'dropping to no band'", bandResult.message.includes("dropping to no band"), bandResult.message);
check("Band imperial: no '0 lb'", !bandResult.message.includes("0 lb"), bandResult.message);
console.log();

// Medicine ball: metric, 2 kg → 1 kg → hold at 1 kg
console.log("5. Medicine ball (metric) 2 kg → 1 kg, then hold at 1 kg");
const ballSe = makeSessionExercise(["medicine_ball"]);
let ballProgress: {
  current_working_weight_kg: string;
  current_target_reps: number;
  consecutive_failures: number;
  best_weight_kg: string;
  best_reps: number;
  best_e1rm: null;
  total_sessions: number;
  weight_at_failure_start_kg: string | null;
} = {
  current_working_weight_kg: "2",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
let ballSets = [
  { reps: 7, weight_kg: "2", duration_seconds: null },
  { reps: 6, weight_kg: "2", duration_seconds: null },
];
let ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
let ballResult = evaluateProgression(ballInput);
// Miss 2
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
ballResult = evaluateProgression(ballInput);
// Miss 3 → 1 kg
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballSets = [
  { reps: 7, weight_kg: String(ballResult.nextWorkingWeightKg), duration_seconds: null },
  { reps: 6, weight_kg: String(ballResult.nextWorkingWeightKg), duration_seconds: null },
];
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
ballResult = evaluateProgression(ballInput);
console.log(`  From 2 kg, miss 3: ${ballResult.nextWorkingWeightKg} kg, msg="${ballResult.message}"`);
check("From 2 kg: drops to 1", ballResult.nextWorkingWeightKg === 1, `got: ${ballResult.nextWorkingWeightKg}`);

// Now miss at 1 kg → hold
ballProgress = {
  current_working_weight_kg: "1",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 6,
  weight_at_failure_start_kg: null,
};
ballSets = [
  { reps: 7, weight_kg: "1", duration_seconds: null },
  { reps: 6, weight_kg: "1", duration_seconds: null },
];
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
ballResult = evaluateProgression(ballInput);
// Miss 2
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
ballResult = evaluateProgression(ballInput);
// Miss 3 → hold at 1
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "metric");
ballResult = evaluateProgression(ballInput);
console.log(`  At 1 kg, miss 3: ${ballResult.nextWorkingWeightKg} kg, outcome=${ballResult.outcome}, msg="${ballResult.message}"`);
check("At 1 kg: holds at 1", ballResult.nextWorkingWeightKg === 1, `got: ${ballResult.nextWorkingWeightKg}`);
check("At 1 kg: outcome is hold", ballResult.outcome === "hold", `got: ${ballResult.outcome}`);
check("At 1 kg: says 'Staying at 1 kg'", ballResult.message.includes("Staying at 1 kg"), ballResult.message);
check("At 1 kg: says 'aim for clean reps'", ballResult.message.includes("aim for clean reps"), ballResult.message);
check("At 1 kg: no '0 kg'", !ballResult.message.includes("0 kg"), ballResult.message);
console.log();

// Medicine ball: imperial, 2 kg → 1 kg → hold at 1 kg (displays as 2 lb)
console.log("6. Medicine ball (imperial) 2 kg → 1 kg, then hold at 1 kg");
ballProgress = {
  current_working_weight_kg: "2",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};
ballSets = [
  { reps: 7, weight_kg: "2", duration_seconds: null },
  { reps: 6, weight_kg: "2", duration_seconds: null },
];
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
// Miss 2
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
// Miss 3 → 1 kg
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballSets = [
  { reps: 7, weight_kg: String(ballResult.nextWorkingWeightKg), duration_seconds: null },
  { reps: 6, weight_kg: String(ballResult.nextWorkingWeightKg), duration_seconds: null },
];
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
console.log(`  Imperial from 2 kg, miss 3: ${ballResult.nextWorkingWeightKg} kg`);
check("Imperial from 2 kg: drops to 1", ballResult.nextWorkingWeightKg === 1, `got: ${ballResult.nextWorkingWeightKg}`);

// Now miss at 1 kg → hold (shows "2 lb")
ballProgress = {
  current_working_weight_kg: "1",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "5",
  best_reps: 12,
  best_e1rm: null,
  total_sessions: 6,
  weight_at_failure_start_kg: null,
};
ballSets = [
  { reps: 7, weight_kg: "1", duration_seconds: null },
  { reps: 6, weight_kg: "1", duration_seconds: null },
];
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
// Miss 2
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
// Miss 3 → hold at 1
ballProgress.consecutive_failures = ballResult.consecutiveFailures;
ballProgress.current_working_weight_kg = String(ballResult.nextWorkingWeightKg);
ballProgress.weight_at_failure_start_kg = ballResult.weightAtFailureStartKg !== null ? String(ballResult.weightAtFailureStartKg) : null;
ballInput = buildProgressionInput(ballSe, ballSets, ballProgress, session, null, "imperial");
ballResult = evaluateProgression(ballInput);
console.log(`  Imperial at 1 kg, miss 3: ${ballResult.nextWorkingWeightKg} kg, outcome=${ballResult.outcome}, msg="${ballResult.message}"`);
check("Imperial at 1 kg: holds at 1", ballResult.nextWorkingWeightKg === 1, `got: ${ballResult.nextWorkingWeightKg}`);
check("Imperial at 1 kg: outcome is hold", ballResult.outcome === "hold", `got: ${ballResult.outcome}`);
check("Imperial at 1 kg: says 'Staying at 2 lb'", ballResult.message.includes("Staying at 2 lb"), ballResult.message);
check("Imperial at 1 kg: says 'aim for clean reps'", ballResult.message.includes("aim for clean reps"), ballResult.message);
check("Imperial at 1 kg: no '0 lb'", !ballResult.message.includes("0 lb"), ballResult.message);
console.log();

console.log("=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - Sequential zero-weight floor logic through real path");
  console.log("Kills mutants: H5, Z1, Z2, BALL-FLOOR");
  process.exit(0);
}
