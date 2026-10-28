#!/usr/bin/env npx tsx
/**
 * L1: Drop-slot guard removed
 * 
 * Mutant: Disable `if (tier === "current")` check that prevents dropping last slot
 * 
 * Test: Build a day where dropping a banned exercise would remove the last slot
 * of a required type (e.g., last squat). Assert the guard prevents the drop.
 */

import { readFileSync } from "fs";
import { applyBannedCleanup } from "../src/lib/program/apply-banned-cleanup";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
const bench = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");

if (!thruster || !bench) {
  console.error("✗ FAIL: test exercises not found");
  process.exit(1);
}

console.log("Testing L1: Drop-slot guard prevents removing last slot\n");

// Build a day with just two exercises: one squat (banned) and one press (safe)
// For current-knee, dropping the squat would leave no lower-body exercises
const plannedExercises = [
  {
    id: "pde1",
    exercise_id: thruster.id, // Squat, banned for current-knee
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
  {
    id: "pde2",
    exercise_id: bench.id, // Press, safe
    order_index: 1,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const result = applyBannedCleanup(
  plannedExercises,
  catalogue,
  {
    goal: "muscle_gain",
    level: "beginner",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    has_all_equipment: false,
  },
  [{ body_region: "knee", severity: "current" }],
  "u1",
  []
);

// The guard should either:
// 1. Find a replacement (changed = true, exercises.length === 2)
// 2. Keep the banned exercise (changed = false, exercises.length === 2)
// 
// With mutant disabled, it might incorrectly drop (exercises.length === 1)

if (result.rows.length < plannedExercises.length) {
  console.error("✗ FAIL: L1 - guard allowed dropping exercise");
  console.error(`  Planned: ${plannedExercises.length} exercises`);
  console.error(`  Result:  ${result.rows.length} exercises`);
  console.error(`  Mutant disabled drop-slot guard for current tier`);
  process.exit(1);
}

console.log("✓ PASS: L1 killed - drop-slot guard preserved exercise count");
console.log(`  Planned: ${plannedExercises.length} exercises`);
console.log(`  Result:  ${result.rows.length} exercises`);
console.log(`  Changed: ${result.changed}`);
