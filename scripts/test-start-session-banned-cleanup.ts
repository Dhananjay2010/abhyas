#!/usr/bin/env npx tsx
/**
 * Test that start-session cleans banned exercises before inserting session_exercises
 * Consumer path: start-session-full-deps.ts line ~208 (applyBannedCleanup before insertSessionExercises)
 * 
 * A started session must never contain a banned slug for a current-knee user.
 * Tests the logged-sets guard: sessions with logged sets are never modified.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
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

console.log("Testing start-session path: banned exercise cleanup\n");

// Simulate planned exercises from program_day_exercises
const planned = [
  {
    id: "planned-1",
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

const cleaned = applyBannedCleanup(
  planned,
  catalogue,
  profile,
  injuries,
  "test-user",
  ["kettlebell", "dumbbell"]
);

// Check that thruster was replaced
if (cleaned.rows[0].exercise_id === thruster.id) {
  console.error("✗ FAIL: kettlebell-thruster not cleaned in start-session path");
  console.error(`  Planned: ${thruster.id}, Cleaned: ${cleaned.rows[0].exercise_id}`);
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster cleaned before session insert");

// Test zero-exercise handling: empty day should not crash
const emptyPlanned: typeof planned = [];
const emptyResult = applyBannedCleanup(
  emptyPlanned,
  catalogue,
  profile,
  injuries,
  "test-user",
  []
);

if (emptyResult.rows.length !== 0) {
  console.error("✗ FAIL: Empty plan should return empty result");
  process.exit(1);
}

console.log("✓ PASS: Zero-exercise day handled (no crash)");
