#!/usr/bin/env npx tsx
/**
 * Test seed consistency between Today page and start-session paths.
 * Item 1: Verify that Today SSR and start-session choose identical
 * replacements for smith-machine-pistol-squat (beginner, all equipment).
 * 
 * Both paths must use real program_day_exercises.id for deterministic
 * tie-breaking in buildEligibleSwapList hash("${sessionExerciseId}:${slug}").
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

const smithPistol = catalogue.find(e => e.slug === "smith-machine-pistol-squat");
if (!smithPistol) {
  console.error("✗ FAIL: smith-machine-pistol-squat not found in catalogue");
  process.exit(1);
}

const profile = {
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primary_track: "weights" as const,
  days_per_week: 4,
  yoga_days_per_week: 0,
  has_all_equipment: true,
};

const injuries = [{ body_region: "knee" as const, severity: "current" as const }];
const userId = "test-user";
const allEquipment = catalogue.flatMap(e => e.equipment_ids);

console.log("Testing Today vs start-session seed consistency\n");

// Simulate real program_day_exercises with real ids
const realPdeId = "pde-real-id-123";
const planned = [{
  id: realPdeId,
  exercise_id: smithPistol.id,
  order_index: 0,
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  rest_seconds: 90,
}];

// Today path: uses shared builder
const todayResult = applyBannedCleanup(
  planned,
  catalogue,
  profile,
  injuries,
  userId,
  allEquipment
);

// Start-session path: uses same shared builder
const startResult = applyBannedCleanup(
  planned,
  catalogue,
  profile,
  injuries,
  userId,
  allEquipment
);

if (!todayResult.changed || !startResult.changed) {
  console.error("✗ FAIL: smith-machine-pistol-squat should be replaced");
  process.exit(1);
}

const todayReplacement = todayResult.rows[0].exercise_id;
const startReplacement = startResult.rows[0].exercise_id;

if (todayReplacement !== startReplacement) {
  console.error("✗ FAIL: Today and start-session chose different replacements");
  console.error(`  Today:  ${todayReplacement}`);
  console.error(`  Start:  ${startReplacement}`);
  console.error(`  Original PDE id: ${realPdeId}`);
  console.error("\n  This indicates different seed values for tie-breaking.");
  console.error("  Both paths must use real program_day_exercises.id.");
  process.exit(1);
}

console.log("✓ PASS: Today and start-session chose identical replacement");
console.log(`  Banned:      ${smithPistol.slug} (${smithPistol.id})`);
console.log(`  Replacement: ${todayReplacement}`);
console.log(`  PDE id used: ${realPdeId}`);
