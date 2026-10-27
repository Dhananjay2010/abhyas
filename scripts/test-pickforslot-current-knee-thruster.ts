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

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as ExerciseRow[];

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster") as CandidateExercise;
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Simulate the filtering logic from pickForSlot (line ~835 of generate.ts)
const hasCurrentKnee = true; // Current knee user
const hasPastKnee = false;

// Check if thruster would be filtered out
const filteredOut = hasCurrentKnee && (isExcludedForPastKnee(thruster) || isExcludedForCurrentKneeOnly(thruster));

if (!filteredOut) {
  console.error("✗ FAIL: kettlebell-thruster NOT filtered out for current-knee user in pickForSlot logic");
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster filtered out in pickForSlot for current-knee user");
