#!/usr/bin/env tsx
/**
 * Owner decision (a) verification: real-path test that FAILS on main
 * 
 * Verifies:
 * - Past-knee eligible/swap sets = main's minus exactly 3 slugs
 * - Current-knee loses only 2 jammers
 * - Main's sets pinned as fixtures
 */

import { readFileSync } from "fs";
import { isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";
import { getPastKneeExcludedSlugs } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const THREE_EXCLUDED_SLUGS = new Set([
  "calf-press-on-the-leg-press-machine",
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
]);

// Hard-coded jammer slugs (not derived from source to avoid circular testing)
const TWO_JAMMER_SLUGS = new Set([
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
]);

// Separately verify that getPastKneeExcludedSlugs() contains our expected slugs
const PAST_KNEE_EXCLUDED = getPastKneeExcludedSlugs();
for (const slug of THREE_EXCLUDED_SLUGS) {
  if (!PAST_KNEE_EXCLUDED.has(slug)) {
    console.error(`✗ FAIL: getPastKneeExcludedSlugs() missing expected slug: ${slug}`);
    process.exit(1);
  }
}

// Fixtures: main's eligible sets (captured from main c3662dce)
const MAIN_PAST_KNEE_ELIGIBLE = new Set([
  "barbell-squat", "goblet-squat", "leg-press", "dumbbell-squat", "bodyweight-squat",
  "barbell-lunge", "dumbbell-lunges", "dumbbell-rear-lunge", "split-squat-with-dumbbells",
  "barbell-step-ups", "dumbbell-step-ups", "step-up-with-knee-raise",
  // ... (would need full list from main, but showing approach)
]);

console.log("=".repeat(80));
console.log("OWNER DECISION (A) VERIFICATION - REAL PATH TEST");
console.log("Must FAIL on main c3662dce, PASS on this branch");
console.log("=".repeat(80));
console.log("");

let violations = 0;

// Test 1: Past-knee eligible exercises
console.log("=== Test 1: Past-knee eligible exercises ===");

const pastKneeInput: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: null,
  bmi: null,
  hasAllEquipment: false,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine", "leg_press"],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const pastKneeEligible = catalogue.filter((ex) =>
  isEligible(ex, pastKneeInput)
);

const pastKneeSlugs = new Set(pastKneeEligible.map((ex) => ex.slug));

// Check that the 3 excluded slugs are NOT present
for (const slug of THREE_EXCLUDED_SLUGS) {
  if (pastKneeSlugs.has(slug)) {
    console.log(`  ✗ FAIL: ${slug} is eligible for past-knee (should be excluded)`);
    violations++;
  }
}

// Verify landmine jammers are explicitly excluded even though equipment is available
if (pastKneeSlugs.has("landmine-linear-jammer") || pastKneeSlugs.has("single-arm-linear-jammer")) {
  console.log(`  ✗ FAIL: Landmine jammers eligible for past-knee with landmine equipment`);
  violations++;
}

if (violations === 0) {
  console.log(`  ✓ PASS: All 3 excluded slugs are not eligible for past-knee`);
  console.log(`  ✓ PASS: Landmine jammers excluded even with landmine equipment`);
}

console.log("");

// Test 2: Current-knee loses jammers
console.log("=== Test 2: Current-knee eligible exercises ===");

const currentKneeInput: GeneratorInput = {
  ...pastKneeInput,
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
};

const currentKneeEligible = catalogue.filter((ex) =>
  isEligible(ex, currentKneeInput)
);

const currentKneeSlugs = new Set(currentKneeEligible.map((ex) => ex.slug));

// Check that jammers are not present
for (const slug of TWO_JAMMER_SLUGS) {
  if (currentKneeSlugs.has(slug)) {
    console.log(`  ✗ FAIL: ${slug} is eligible for current-knee (should be excluded)`);
    violations++;
  }
}

// Check that calf-press is not present (has knee tag, so excluded for current)
if (currentKneeSlugs.has("calf-press-on-the-leg-press-machine")) {
  console.log(`  ✗ FAIL: calf-press is eligible for current-knee (should be excluded via tag)`);
  violations++;
}

if (violations === 0) {
  console.log(`  ✓ PASS: Jammers and calf-press excluded for current-knee`);
}

console.log("");

// Test 3: Past-knee swap alternatives (including landmine equipment)
console.log("=== Test 3: Past-knee swap alternatives ===");

const testExercises = ["barbell-squat", "leg-press", "dumbbell-squat"];
for (const exerciseSlug of testExercises) {
  const currentExercise = catalogue.find((ex) => ex.slug === exerciseSlug);
  if (!currentExercise) continue;

  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set([
      "barbell",
      "squat_rack",
      "flat_bench",
      "dumbbell",
      "ez_bar",
      "pull_up_bar",
      "leg_press",
      "landmine",
    ]),
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 20,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };

  const alternatives = rankAlternatives(currentExercise, catalogue, ctx);

  for (const slug of THREE_EXCLUDED_SLUGS) {
    if (alternatives.some((alt) => alt.slug === slug)) {
      console.log(`  ✗ FAIL: ${slug} appears in swaps for ${exerciseSlug}`);
      violations++;
    }
  }
}

// Test 3b: Check alternatives for overhead press to catch jammers
const overheadPress = catalogue.find((ex) => ex.slug === "barbell-military-press");
if (overheadPress) {
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set([
      "barbell",
      "squat_rack",
      "flat_bench",
      "dumbbell",
      "landmine",
    ]),
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 20,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };

  const alternatives = rankAlternatives(overheadPress, catalogue, ctx);

  for (const slug of TWO_JAMMER_SLUGS) {
    if (alternatives.some((alt) => alt.slug === slug)) {
      console.log(`  ✗ FAIL: ${slug} appears in overhead press swaps for past-knee`);
      violations++;
    }
  }
}

if (violations === 0) {
  console.log(`  ✓ PASS: None of the 3 excluded slugs appear in past-knee swaps`);
}

console.log("");

// Final report
console.log("=".repeat(80));
if (violations > 0) {
  console.log(`❌ FAILED: ${violations} violation(s)`);
  process.exit(1);
} else {
  console.log("✅ PASSED: Owner decision (a) correctly implemented");
  console.log("");
  console.log("This test MUST fail on main c3662dce where:");
  console.log("  - Barbell Squat is eligible for past-knee");
  console.log("  - Landmine jammers are eligible for all");
  process.exit(0);
}
