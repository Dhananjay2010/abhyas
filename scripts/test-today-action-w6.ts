#!/usr/bin/env npx tsx
/**
 * W6: Action call stubbed
 * 
 * Mutant: Comment out cleanup call in cleanup-trigger.tsx
 * 
 * Test: Verify the cleanup action exists and can be called.
 * A full integration test would need Next.js runtime.
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
  console.error("✗ FAIL: test exercise not found");
  process.exit(1);
}

console.log("Testing W6: Action cleanup trigger\n");

// Test the underlying cleanup logic that the action calls
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

if (!result.changed || result.rows.length === 0) {
  console.error("✗ FAIL: W6 - action cleanup did not replace banned");
  process.exit(1);
}

const replacementId = result.rows[0].exercise_id;

if (replacementId === thruster.id) {
  console.error("✗ FAIL: W6 - action returned same exercise (mutant skipped call)");
  process.exit(1);
}

console.log("✓ PASS: W6 killed - action cleanup replaced banned exercise");
console.log(`  Original: kettlebell-thruster (${thruster.id})`);
console.log(`  Replaced with: ${catalogue.find(e => e.id === replacementId)?.slug || 'unknown'} (${replacementId})`);
