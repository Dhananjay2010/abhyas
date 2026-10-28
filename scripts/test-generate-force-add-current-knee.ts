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

// Current-knee user with limited equipment to trigger force-add paths
const currentKneeInput: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["kettlebell", "dumbbell"],
  currentInjuryRegions: ["knee"], // Current knee injury
  anyKneeInjury: true,
  preferredSessionMinutes: 45,
  catalogue,
};

const program = generateProgram(currentKneeInput);

// Build a map from exerciseId to slug
const idToSlug = new Map<string, string>();
for (const ex of catalogue) {
  idToSlug.set(ex.id, ex.slug);
}

// Check all exercises in the program
const bannedSlugs = [
  "kettlebell-thruster",
  "one-arm-kettlebell-push-press",
  "double-kettlebell-push-press",
  "one-arm-kettlebell-jerk",
  "double-kettlebell-jerk",
];

let foundBanned = false;
for (const day of program.days) {
  for (const ex of day.exercises) {
    const slug = idToSlug.get(ex.exerciseId);
    if (slug && bannedSlugs.includes(slug)) {
      console.error(`✗ FAIL: Found banned slug ${slug} in force-add path`);
      foundBanned = true;
    }
  }
}

if (foundBanned) {
  process.exit(1);
}

console.log("✓ PASS: Force-add path correctly filters current-knee banned slugs");
