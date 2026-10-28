#!/usr/bin/env npx tsx
/**
 * Test start-session cleanup call site (M10)
 * Tests that applyBannedCleanup is actually called via applyStartSessionCleanup.
 * 
 * If the call is removed or no-op'd, this test must fail.
 */

import { readFileSync } from "fs";
import { applyStartSessionCleanup } from "../src/lib/session/start-session-full-deps";
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

console.log("Testing start-session cleanup call site\n");

// Simulate planned exercises from program_day_exercises
const plannedForCleaning = [
  {
    id: "pde-1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

// Current-knee user
const profile = {
  goal: "strength" as const,
  level: "intermediate" as const,
  primary_track: "weights" as const,
  days_per_week: 4,
  yoga_days_per_week: 0,
  has_all_equipment: false,
};

const injuries = [{ body_region: "knee" as const, severity: "current" as const }];
const userId = "test-user";
const equipmentIds = ["kettlebell", "dumbbell"];

// Call the extracted helper
const cleaned = applyStartSessionCleanup(
  plannedForCleaning,
  catalogue,
  profile,
  injuries,
  userId,
  equipmentIds
);

// Check that thruster was replaced
if (cleaned[0].exercise_id === thruster.id) {
  console.error("✗ FAIL: kettlebell-thruster not cleaned in start-session path");
  console.error(`  Planned: ${thruster.id}, Cleaned: ${cleaned[0].exercise_id}`);
  console.error("  The start-session cleanup call may have been removed or bypassed");
  process.exit(1);
}

console.log("✓ PASS: start-session cleanup call site works");
console.log(`  Original: ${thruster.id}`);
console.log(`  Cleaned:  ${cleaned[0].exercise_id}`);
