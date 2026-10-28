#!/usr/bin/env npx tsx
/**
 * L1: Drop-slot guard removed
 * 
 * Mutant: `if (false && tier === "current") {` at replace-banned-in-planned.ts
 * 
 * Test: Provide a banned exercise with ZERO safe alternatives (tiny catalogue).
 * For current-knee tier, assert the slot is dropped (length decreases).
 * Mutant would keep the banned exercise (no drop).
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

console.log("Testing L1: Drop-slot guard for current-knee with zero alternatives\n");

// Create tiny catalogue with just thruster (banned) and bench (different pattern)
const tinyCatalogue = [thruster, bench];

// Plan: thruster (banned) + bench (safe)
const planned = [
  {
    id: "pde1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
  {
    id: "pde2",
    exercise_id: bench.id,
    order_index: 1,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

// Apply cleanup with current-knee injury
const result = applyBannedCleanup(
  planned,
  tinyCatalogue,
  {
    goal: "muscle_gain",
    level: "beginner",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    has_all_equipment: true,
  },
  [{ body_region: "knee", severity: "current" }],
  "u1",
  ["kettlebell", "barbell"]
);

// With zero alternatives in tiny catalogue, current-knee guard should drop the slot
if (result.rows.length === planned.length) {
  // Check if thruster is still present
  if (result.rows.some(r => r.exercise_id === thruster.id)) {
    console.error("✗ FAIL: L1 - banned exercise kept despite zero alternatives");
    console.error(`  Mutant disabled drop-slot guard for current tier`);
    process.exit(1);
  }
  // Otherwise it found a replacement somehow (unlikely with tiny catalogue)
}

if (result.rows.length < planned.length) {
  // Slot was dropped - this is correct behavior
  if (result.rows.some(r => r.exercise_id === thruster.id)) {
    console.error("✗ FAIL: L1 - slot dropped but still contains banned exercise");
    process.exit(1);
  }
  console.log("✓ PASS: L1 killed - drop-slot guard dropped banned exercise");
  console.log(`  Planned: ${planned.length} exercises`);
  console.log(`  Result:  ${result.rows.length} exercises (slot dropped)`);
  console.log(`  Changed: ${result.changed}`);
  process.exit(0);
}

// If we get here, something unexpected happened
console.error("✗ FAIL: L1 - unexpected result");
console.error(`  Planned: ${planned.length}, Result: ${result.rows.length}, Changed: ${result.changed}`);
process.exit(1);
