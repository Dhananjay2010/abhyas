#!/usr/bin/env npx tsx
/**
 * Test that generate.ts force-add lower-body path filters current-knee banned slugs
 * Consumer path: generate.ts line ~1319 (isExcludedForCurrentKneeOnly check)
 * 
 * The current-knee force-add must apply the shared ban list.
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

console.log("Testing generate.ts force-add current-knee filter\n");

// Find a current-knee-only banned exercise that would be added via force-add if the filter is removed
const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
const pushPress = catalogue.find(e => e.slug === "one-arm-kettlebell-push-press");

if (!thruster || !pushPress) {
  console.error("✗ FAIL: Test exercises not found in catalogue");
  process.exit(1);
}

// Check that these are in the current-knee-only list
const { isExcludedForCurrentKneeOnly } = require("../src/lib/program/past-knee.ts");
if (!isExcludedForCurrentKneeOnly(thruster)) {
  console.error("✗ FAIL: kettlebell-thruster should be current-knee-only excluded");
  process.exit(1);
}

// Current-knee user with limited equipment to trigger force-add paths
// Use minimal equipment and beginner level to limit the pool
const currentKneeInput: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["kettlebell"], // Only kettlebell
  currentInjuryRegions: ["knee"], // Current knee injury
  anyKneeInjury: true,
  preferredSessionMinutes: 30, // Short session
  catalogue,
};

const program = generateProgram(currentKneeInput);

// Build a map from exerciseId to slug
const idToSlug = new Map<string, string>();
for (const ex of catalogue) {
  idToSlug.set(ex.id, ex.slug);
}

// Check all exercises in the program for current-knee-only banned slugs
const bannedSlugs = [
  "kettlebell-thruster",
  "one-arm-kettlebell-push-press",
  "double-kettlebell-push-press",
  "one-arm-kettlebell-jerk",
  "double-kettlebell-jerk",
];

let foundBanned = false;
const allExercises: string[] = [];
for (const day of program.days) {
  for (const ex of day.exercises) {
    const slug = idToSlug.get(ex.exerciseId);
    if (slug) {
      allExercises.push(slug);
      if (bannedSlugs.includes(slug)) {
        console.error(`✗ FAIL: Found banned slug ${slug} in generated program`);
        console.error(`  The force-add filter may have been removed or bypassed`);
        foundBanned = true;
      }
    }
  }
}

if (foundBanned) {
  process.exit(1);
}

console.log("✓ PASS: Force-add path correctly filters current-knee banned slugs");
console.log(`  Generated ${program.days.length} days with ${allExercises.length} total exercise slots`);
