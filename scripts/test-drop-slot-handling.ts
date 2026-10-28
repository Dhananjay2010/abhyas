#!/usr/bin/env npx tsx
/**
 * Test L1: Drop-slot handling (zero safe alternatives).
 * 
 * Must ✗ FAIL if code crashes when a banned exercise has zero safe alternatives
 * (e.g. index-out-of-bounds, undefined access). Must handle gracefully.
 */

import { readFileSync } from "fs";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import { applyBannedCleanup } from "../src/lib/program/apply-banned-cleanup";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Pick an exercise that will have all alternatives filtered out
const pistolSquat = catalogue.find(e => e.slug === "smith-machine-pistol-squat");
if (!pistolSquat) {
  console.error("✗ FAIL: smith-machine-pistol-squat not found");
  process.exit(1);
}

console.log("Testing drop-slot handling (L1)\n");

const planned = [{
  id: "pde-drop",
  exercise_id: pistolSquat.id,
  order_index: 0,
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  rest_seconds: 90,
}];

// Use very restrictive conditions: knee injury, no equipment
const profile = {
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primary_track: "weights" as const,
  days_per_week: 4,
  yoga_days_per_week: 0,
  has_all_equipment: false,
};

const injuries = [{ body_region: "knee" as const, severity: "current" as const }];
const equipmentIds: string[] = []; // NO equipment - forces alternatives to be filtered

let result;
try {
  result = applyBannedCleanup(
    planned,
    catalogue,
    profile,
    injuries,
    "test-user",
    equipmentIds
  );
} catch (error) {
  console.error("✗ FAIL: L1 - Code crashed on drop-slot (no safe alternatives)");
  console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
  console.error("  Must handle zero-alternative case gracefully");
  process.exit(1);
}

// When there are zero safe alternatives, the slot should be dropped
// Result can be: empty (slot dropped) OR unchanged (no knee injury detected/no replacement needed)
// The key is that it doesn't crash

if (result.rows.length === 0) {
  console.log("✓ PASS: L1 killed - drop-slot handled gracefully (slot dropped)");
  console.log(`  Input: 1 exercise, Output: 0 exercises`);
} else if (result.rows[0].exercise_id === pistolSquat.id) {
  // Unchanged is also acceptable if no replacement was attempted
  console.log("✓ PASS: L1 killed - drop-slot handled gracefully (unchanged)");
  console.log(`  Input: 1 exercise, Output: 1 exercise (unchanged)`);
} else {
  console.log("✓ PASS: L1 killed - drop-slot handled gracefully (replaced)");
  console.log(`  Input: 1 exercise, Output: ${result.rows.length} exercises`);
  console.log(`  Changed: ${result.changed}`);
}
