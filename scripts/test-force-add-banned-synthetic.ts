#!/usr/bin/env npx tsx
/**
 * M11: Force-add current-knee filter removed
 * 
 * Mutant: Disable isExcludedForCurrentKneeOnly check in force-add path
 * 
 * Test: Try to add a current-knee-only banned exercise to a planned set.
 * Assert it doesn't get added (filtered out).
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

if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found");
  process.exit(1);
}

console.log("Testing M11: Force-add filter excludes current-knee-only banned\n");

// Test with current-knee injury - thruster is current-knee-only banned
const result = applyBannedCleanup(
  [{
    id: "pde1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  }],
  catalogue,
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
  catalogue.flatMap(e => e.equipment_ids)
);

if (!result.changed) {
  console.error("✗ FAIL: M11 - banned exercise was not replaced");
  console.error(`  Input: kettlebell-thruster (${thruster.id})`);
  console.error(`  Expected cleanup to replace it`);
  process.exit(1);
}

const finalIds = result.rows.map(e => e.exercise_id);

if (finalIds.includes(thruster.id)) {
  console.error("✗ FAIL: M11 - current-knee-only banned exercise in result");
  console.error(`  Result includes: kettlebell-thruster (${thruster.id})`);
  console.error(`  Mutant disabled force-add filter`);
  process.exit(1);
}

console.log("✓ PASS: M11 killed - current-knee-only banned was replaced");
console.log(`  Input: kettlebell-thruster (${thruster.id})`);
console.log(`  Replacement count: ${result.rows.length}`);
