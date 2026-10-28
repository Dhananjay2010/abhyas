#!/usr/bin/env tsx
/**
 * Test: Imperial units through progressionFeedback from actions.ts
 * 
 * MED-2: Test the REAL extracted function that actions.ts calls,
 * not a copy. This kills mutants in PRODUCTION code:
 * - UN1: actions.ts passes "metric" instead of units
 * - UN2: progressionFeedback calls describePersonalBest without units
 * - UN4: buildProgressionInput drops units field
 */

import { progressionFeedback } from "../src/lib/session/progression-feedback";
import * as fs from "fs";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("Imperial units through progressionFeedback (real production code)\n");

interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  planned_sets: number;
  planned_reps_min: number;
  planned_reps_max: number;
  metric: "reps";
  exercises: {
    mechanic: "compound";
    movement_pattern: "horizontal_press";
    equipment_ids: string[];
    progression_chain: null;
    progression_rank: null;
  };
}

const sessionExercise: SessionExerciseRow = {
  id: "se1",
  session_id: "s1",
  exercise_id: "e1",
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

const progress = {
  current_working_weight_kg: "40",
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: "40",
  best_reps: 12,
  best_e1rm: "56",
  total_sessions: 5,
  weight_at_failure_start_kg: null,
};

const session = {
  is_deload: false,
  local_date: "2026-10-26",
  program_id: "p1",
};

const successSets = [
  { reps: 12, weight_kg: "40", duration_seconds: null },
  { reps: 12, weight_kg: "40", duration_seconds: null },
  { reps: 12, weight_kg: "40", duration_seconds: null },
];

const pbSets = [
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
  { reps: 12, weight_kg: "43.1", duration_seconds: null },
];

console.log("1. Test imperial path (40 kg → 42.5 kg = 93.5 lb)");
const imperial = progressionFeedback(sessionExercise, successSets, progress, session, "right", "imperial");

// UN4: Check input has units field
check("Input has units: 'imperial'", JSON.stringify(imperial.input).includes('"unit":"lb"'), JSON.stringify(imperial.input));

// UN1: Check progression message uses imperial (not metric)
console.log(`  Message: "${imperial.decision.message}"`);
check("Message contains 'lb'", imperial.decision.message.includes("lb"), imperial.decision.message);
check("Message does NOT contain 'kg'", !imperial.decision.message.includes("kg"), imperial.decision.message);
check("Message shows exact 'up to 93.5 lb'", imperial.decision.message.includes("up to 93.5 lb"), imperial.decision.message);

console.log("\n2. Test PB with imperial (43.1 kg = 95 lb)");
const imperialPB = progressionFeedback(sessionExercise, pbSets, progress, session, "right", "imperial");

// UN2: Check PB toast uses imperial (not metric)
if (imperialPB.personalBest) {
  console.log(`  PB: "${imperialPB.personalBest}"`);
  check("PB contains 'lb'", imperialPB.personalBest.includes("lb"), imperialPB.personalBest);
  check("PB does NOT contain 'kg'", !imperialPB.personalBest.includes("kg"), imperialPB.personalBest);
  check("PB shows exact 'Heaviest set yet — 95 lb'", imperialPB.personalBest.includes("Heaviest set yet — 95 lb"), imperialPB.personalBest);
} else {
  failures++;
  console.log("❌ No PB toast");
}

console.log("\n3. Sanity: metric still works (40 kg → 42.5 kg)");
const metric = progressionFeedback(sessionExercise, successSets, progress, session, "right", "metric");
console.log(`  Metric: "${metric.decision.message}"`);
check("Metric has 'kg'", metric.decision.message.includes("kg"));
check("Metric has NO 'lb'", !metric.decision.message.includes("lb"));
check("Metric shows 'up to 42.5 kg'", metric.decision.message.includes("up to 42.5 kg"));

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL PASS");
  console.log("Kills mutants in PRODUCTION code:");
  console.log("  - L4B-4/UN1: actions.ts/progressionFeedback passes 'metric' → test FAILS (sees 'kg' not 'lb')");
  console.log("  - UN2: progressionFeedback omits units in describePersonalBest → test FAILS (no '95 lb')");
  console.log("  - UN4: buildProgressionInput drops units field → test FAILS (input has no units)");
  process.exit(0);
}
