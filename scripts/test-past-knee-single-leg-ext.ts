#!/usr/bin/env npx tsx
/**
 * Test single-leg-leg-extension exclusion for past-knee users.
 * 
 * Owner decision: Exclude single-leg-leg-extension for PAST-knee users only.
 * Current-knee and no-injury users should still have access to it.
 */

import { readFileSync } from "fs";
import { generateProgram, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const SINGLE_LEG_EXT_SLUG = "single-leg-leg-extension";

let failures = 0;

console.log("=".repeat(80));
console.log("SINGLE-LEG-LEG-EXTENSION EXCLUSION TEST");
console.log("Verify past-knee users never get single-leg-leg-extension in plans or swaps");
console.log("=".repeat(80));
console.log("");

// Test 1: Past-knee users must NOT have single-leg-leg-extension in eligible list
console.log("=== Test 1: Past-knee isEligible ===");

const pastKneeInputs: GeneratorInput[] = [
  {
    userId: "past-knee-beginner",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    preferredSessionMinutes: 60,
    catalogue,
  },
  {
    userId: "past-knee-intermediate",
    blockNumber: 1,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "leg_extension"],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    preferredSessionMinutes: 60,
    catalogue,
  },
];

const singleLegExt = catalogue.find(ex => ex.slug === SINGLE_LEG_EXT_SLUG);
if (!singleLegExt) {
  console.log(`✗ FAIL: ${SINGLE_LEG_EXT_SLUG} not found in catalogue`);
  failures++;
} else {
  for (const input of pastKneeInputs) {
    const eligible = isEligible(singleLegExt, input);
    if (eligible) {
      console.log(`  ✗ FAIL: ${input.level} past-knee user has ${SINGLE_LEG_EXT_SLUG} eligible`);
      failures++;
    } else {
      console.log(`  ✓ PASS: ${input.level} past-knee user excludes ${SINGLE_LEG_EXT_SLUG}`);
    }
  }
}

console.log("");

// Test 2: Past-knee users must NOT have single-leg-leg-extension in swap lists
console.log("=== Test 2: Past-knee swap lists ===");

const swapExercises = ["barbell-squat", "goblet-squat", "leg-press"];

const pastKneeSwapInput: GeneratorInput = {
  userId: "past-knee-swap-test",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "leg_extension"],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

for (const swapSlug of swapExercises) {
  const exercise = catalogue.find(ex => ex.slug === swapSlug);
  if (!exercise) continue;
  
  const patterns = getSwapPatterns(exercise.movement_pattern, pastKneeSwapInput);
  const pool = catalogue.filter(ex => patterns.includes(ex.movement_pattern));
  const eligible = pool.filter(ex => isEligible(ex, pastKneeSwapInput));
  
  const hasSingleLegExt = eligible.some(alt => alt.slug === SINGLE_LEG_EXT_SLUG);
  
  if (hasSingleLegExt) {
    console.log(`  ✗ FAIL: ${swapSlug} swaps include ${SINGLE_LEG_EXT_SLUG} for past-knee`);
    failures++;
  } else {
    console.log(`  ✓ PASS: ${swapSlug} swaps exclude ${SINGLE_LEG_EXT_SLUG} for past-knee`);
  }
}

console.log("");

// Test 3: Past-knee programs must NOT include single-leg-leg-extension
console.log("=== Test 3: Past-knee program generation ===");

for (const input of pastKneeInputs) {
  const program = generateProgram(input);
  const allExercises = program.days.flatMap(day => day.exercises);
  const hasSingleLegExt = allExercises.some(ex => {
    const exData = catalogue.find(c => c.id === ex.exerciseId);
    return exData?.slug === SINGLE_LEG_EXT_SLUG;
  });
  
  if (hasSingleLegExt) {
    console.log(`  ✗ FAIL: ${input.level} past-knee program contains ${SINGLE_LEG_EXT_SLUG}`);
    failures++;
  } else {
    console.log(`  ✓ PASS: ${input.level} past-knee program excludes ${SINGLE_LEG_EXT_SLUG}`);
  }
}

console.log("");

// Test 4: Non-knee users SHOULD have access to single-leg-leg-extension
console.log("=== Test 4: Non-knee users can access single-leg-leg-extension ===");

const noKneeInput: GeneratorInput = {
  userId: "no-knee-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["leg_extension"],
  currentInjuryRegions: [],
  anyKneeInjury: false,
  preferredSessionMinutes: 60,
  catalogue,
};

if (singleLegExt) {
  const eligible = isEligible(singleLegExt, noKneeInput);
  if (eligible) {
    console.log(`  ✓ PASS: No-injury user can access ${SINGLE_LEG_EXT_SLUG}`);
  } else {
    console.log(`  ✗ FAIL: No-injury user cannot access ${SINGLE_LEG_EXT_SLUG} (should be available)`);
    failures++;
  }
}

console.log("");

// Test 5: Current-knee users SHOULD have access to single-leg-leg-extension
console.log("=== Test 5: Current-knee users can access single-leg-leg-extension ===");

const currentKneeInput: GeneratorInput = {
  userId: "current-knee-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["leg_extension"],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

if (singleLegExt) {
  const eligible = isEligible(singleLegExt, currentKneeInput);
  if (eligible) {
    console.log(`  ✓ PASS: Current-knee user can access ${SINGLE_LEG_EXT_SLUG}`);
  } else {
    console.log(`  ✗ FAIL: Current-knee user cannot access ${SINGLE_LEG_EXT_SLUG} (should be available)`);
    failures++;
  }
}

console.log("");

console.log("=".repeat(80));
if (failures === 0) {
  console.log("✅ PASSED: Single-leg-leg-extension correctly excluded for past-knee only");
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${failures} assertion(s) failed`);
  process.exit(1);
}
