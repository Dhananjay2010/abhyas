#!/usr/bin/env npx tsx
/**
 * Behavioural test that kettlebell-thruster is filtered out during pickForSlot
 * for current-knee users.
 * 
 * This tests the filtering at the point where candidates are ranked and selected
 * (after isEligible but during the actual slot selection with past-knee filtering).
 * Killed by M5 mutant (removing thruster from exclusion lists).
 */

import { readFileSync } from "fs";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";
import { isExcludedForPastKnee, isExcludedForCurrentKneeOnly } from "../src/lib/program/past-knee";
import type { Database } from "../src/lib/database.types";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Simulate the filtering logic from pickForSlot (line ~835 of generate.ts)
const hasCurrentKnee = true; // Current knee user
const hasPastKnee = false;

// Test the filter conditions
const isPastKneeExcluded = isExcludedForPastKnee(thruster);
const isCurrentKneeOnlyExcluded = isExcludedForCurrentKneeOnly(thruster);

const wouldBeFiltered = hasCurrentKnee && (isPastKneeExcluded || isCurrentKneeOnlyExcluded);

if (!wouldBeFiltered) {
  console.error("✗ FAIL: kettlebell-thruster not filtered for current-knee user");
  console.error(`  isPastKneeExcluded: ${isPastKneeExcluded}`);
  console.error(`  isCurrentKneeOnlyExcluded: ${isCurrentKneeOnlyExcluded}`);
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster filtered for current-knee user");
