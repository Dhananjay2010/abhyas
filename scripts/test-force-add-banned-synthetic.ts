#!/usr/bin/env npx tsx
/**
 * M11: Force-add current-knee filter removed
 * 
 * Mutant: Disable isExcludedForCurrentKneeOnly check in force-add path
 * 
 * Test: Generate exercises for current-knee injury. Assert that current-knee-only
 * banned exercises (like kettlebell-thruster) are never added.
 */

import { readFileSync } from "fs";
import { generateProgramDay } from "../src/lib/program/generate";
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

// Generate with current-knee injury
const result = generateProgramDay({
  dayType: "weights",
  dayIndex: 1,
  exercises: catalogue,
  profile: {
    goal: "muscle_gain",
    level: "beginner",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    has_all_equipment: true,
  },
  injuries: [{ body_region: "knee", severity: "current" }],
  equipmentIds: catalogue.flatMap(e => e.equipment_ids),
  userId: "u1",
});

if (!result.ok || !result.exercises) {
  console.error("✗ FAIL: generateProgramDay failed");
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

const exerciseIds = result.exercises.map(e => e.id);

if (exerciseIds.includes(thruster.id)) {
  console.error("✗ FAIL: M11 - current-knee-only banned exercise was generated");
  console.error(`  Generated: kettlebell-thruster (${thruster.id})`);
  console.error(`  Mutant disabled force-add filter check`);
  process.exit(1);
}

console.log("✓ PASS: M11 killed - force-add filter excludes banned");
console.log(`  Generated ${exerciseIds.length} exercises`);
console.log(`  kettlebell-thruster correctly excluded`);
