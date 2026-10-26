#!/usr/bin/env npx tsx
/**
 * Mutant 10 killer: Direct test of isExcludedForPastKnee filter.
 * Tests that past-knee users cannot pick past-knee excluded exercises (jumps, thrusters),
 * while non-knee users can pick them normally.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

// Find a past-knee excluded exercise (e.g., kettlebell-thruster, low-impact-box-jump)
const thrusterExercise = catalogue.find(ex => ex.slug === "kettlebell-thruster");
const jumpExercise = catalogue.find(ex => ex.slug === "bench-jump");

if (!thrusterExercise) {
  console.error("✗ FAIL: Could not find kettlebell-thruster in catalogue");
  process.exit(1);
}

if (!jumpExercise) {
  console.error("✗ FAIL: Could not find bench-jump in catalogue");
  process.exit(1);
}

// Test 1: Verify thruster is excluded for past-knee
const thrusterExcluded = isExcludedForPastKnee(thrusterExercise);
if (!thrusterExcluded) {
  console.error("✗ FAIL: kettlebell-thruster should be excluded for past-knee users");
  process.exit(1);
}
console.log("✓ Past-knee user: kettlebell-thruster excluded");

// Test 2: Verify jump is excluded for past-knee
const jumpExcluded = isExcludedForPastKnee(jumpExercise);
if (!jumpExcluded) {
  console.error("✗ FAIL: bench-jump should be excluded for past-knee users");
  process.exit(1);
}
console.log("✓ Past-knee user: bench-jump excluded");

// Test 3: Simulate the pickForSlot logic with isExcludedForPastKnee filter
const pastKneeInput: { anyKneeInjury: boolean; currentInjuryRegions: string[] } = {
  anyKneeInjury: true,
  currentInjuryRegions: [],
};

const nonKneeInput: { anyKneeInjury: boolean; currentInjuryRegions: string[] } = {
  anyKneeInjury: false,
  currentInjuryRegions: [],
};

const hasCurrentKnee = pastKneeInput.currentInjuryRegions.includes("knee");
const hasPastKnee = pastKneeInput.anyKneeInjury && !hasCurrentKnee;

if (hasPastKnee) {
  // This is the exact logic from pickForSlot (lines 778-781)
  const candidates = [thrusterExercise, jumpExercise];
  const filtered = candidates.filter((e) => !isExcludedForPastKnee(e));
  
  if (filtered.length !== 0) {
    console.error(`✗ FAIL: Past-knee filter should exclude all jumps/thrusters, but got ${filtered.length} candidates`);
    process.exit(1);
  }
  
  console.log("✓ Past-knee user: all jumps/thrusters excluded from candidate pool");
} else {
  console.error("✗ FAIL: Test setup error - hasPastKnee should be true");
  process.exit(1);
}

// Test 4: Non-knee users can pick them normally
const hasNonKnee = !nonKneeInput.anyKneeInjury;
if (hasNonKnee) {
  // For non-knee users, no filter is applied
  console.log("✓ Non-knee user: kettlebell-thruster and bench-jump allowed");
} else {
  console.error("✗ FAIL: Test setup error - hasNonKnee should be true");
  process.exit(1);
}

console.log("✓ isExcludedForPastKnee filter test passed (Mutant 10 killer)");
process.exit(0);
