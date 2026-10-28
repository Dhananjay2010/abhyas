#!/usr/bin/env npx tsx
/**
 * M11: Force-add current-knee filter removed
 * 
 * Mutant: `if (false && isExcludedForCurrentKneeOnly(e)) return false;`
 *         at generate.ts:1338 in force-add lower-body path
 * 
 * Test: Generate a full program for current-knee user. Assert no generated
 * exercises are current-knee-only banned (like kettlebell-thruster).
 */

import { readFileSync } from "fs";
import { generateProgram } from "../src/lib/program/generate";
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

// Generate full program with current-knee injury
const result = generateProgram({
  userId: "u1",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 25,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: catalogue.flatMap(e => e.equipment_ids),
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  catalogue,
});

if (!result.days || result.days.length === 0) {
  console.error("✗ FAIL: generateProgram returned no days");
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

// Check all exercises across all days
const allExerciseIds = result.days.flatMap(day => 
  day.exercises.map(ex => ex.exerciseId)
);

if (allExerciseIds.includes(thruster.id)) {
  console.error("✗ FAIL: M11 - current-knee-only banned exercise in generated program");
  console.error(`  Found: kettlebell-thruster (${thruster.id})`);
  console.error(`  Mutant disabled isExcludedForCurrentKneeOnly in force-add path`);
  process.exit(1);
}

// Also check that no other current-knee-only banned exercises appear
const currentKneeOnlyBanned = catalogue.filter(e => {
  // These are in CURRENT_KNEE_ONLY_BANNED list per past-knee.ts
  return ["kettlebell-thruster", "dumbbell-thruster", "barbell-thruster"].includes(e.slug);
});

const foundBanned = currentKneeOnlyBanned.filter(banned => 
  allExerciseIds.includes(banned.id)
);

if (foundBanned.length > 0) {
  console.error("✗ FAIL: M11 - current-knee-only banned exercises in program:");
  foundBanned.forEach(ex => {
    console.error(`  - ${ex.slug} (${ex.id})`);
  });
  process.exit(1);
}

console.log("✓ PASS: M11 killed - no current-knee-only banned exercises generated");
console.log(`  Program has ${result.days.length} days, ${allExerciseIds.length} total exercises`);
console.log(`  Verified thrusters (kettlebell/dumbbell/barbell) excluded`);
