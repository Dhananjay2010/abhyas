#!/usr/bin/env npx tsx
/**
 * Behavioural test that kettlebell-thruster is excluded for current-knee users
 * during program generation.
 * 
 * This tests the actual generator path: that a current-knee user cannot receive
 * kettlebell-thruster in their generated program.
 * 
 * Killed by M5 mutant (removing thruster from CURRENT_KNEE_ONLY_EXCLUDED_SLUGS).
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Current-knee user (knee in currentInjuryRegions)
const currentKneeInput: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["knee"], // CURRENT knee injury
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const program = generateProgram(currentKneeInput);

// Build a map from exerciseId to slug
const idToSlug = new Map<string, string>();
for (const ex of catalogue) {
  idToSlug.set(ex.id, ex.slug);
}

// Check that no day contains kettlebell-thruster
let found = false;
for (const [dayIndex, day] of program.days.entries()) {
  for (const ex of day.exercises) {
    const slug = idToSlug.get(ex.exerciseId);
    if (slug === "kettlebell-thruster") {
      console.error(`✗ FAIL: kettlebell-thruster found in day ${dayIndex + 1} for CURRENT-knee user`);
      console.error(`  Exercise:`, ex);
      found = true;
    }
  }
}

if (found) {
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster excluded from current-knee user's program");
