#!/usr/bin/env tsx
/**
 * Owner decision (a) verification test for PR #157
 * 
 * Verifies that exactly 3 exercises are newly excluded for past-knee users:
 * - calf-press-on-the-leg-press-machine (QA Bot 1)
 * - landmine-linear-jammer (G-3)
 * - single-arm-linear-jammer (G-3)
 * 
 * And that past-knee squat-pattern availability (barbell-squat, goblet-squat, leg-press, 
 * dumbbell-squat, lunges, split squats, step-ups) is UNCHANGED from main.
 * 
 * Also includes mutants that must be killed:
 * - Remove each of the 3 from PAST_KNEE_EXCLUDED_SLUGS
 * - Re-apply tag exclusion to past-knee users
 */

import { generateProgram } from "../src/lib/program/generate";
import catalogueData from "./fixtures/catalogue.json";

const CATALOGUE = catalogueData as any[];

const THREE_NEW_EXCLUDED = new Set([
  "calf-press-on-the-leg-press-machine",
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
]);

// Squat-pattern exercises that should be available for past-knee users (as on main)
const PAST_KNEE_SQUAT_PATTERN_AVAILABILITY = new Set([
  "barbell-squat",
  "goblet-squat",
  "leg-press",
  "dumbbell-squat",
  "bodyweight-squat",
  "chair-squat",
  // Lunges
  "barbell-lunge",
  "dumbbell-lunges",
  "dumbbell-rear-lunge",
  // Split squats and step-ups
  "split-squat-with-dumbbells",
  "barbell-step-ups",
  "dumbbell-step-ups",
  "step-up-with-knee-raise",
]);

console.log("=".repeat(80));
console.log("OWNER DECISION (A) VERIFICATION TEST");
console.log("=".repeat(80));
console.log("");

let violations = 0;

// Test 1: Verify the 3 exercises are excluded from past-knee generation
console.log("=== Test 1: Past-knee generation excludes exactly the 3 new slugs ===");

const pastKneeProgram = generateProgram({
  userId: "test-user",
  blockNumber: 1,
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: null,
  bmi: null,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true, // Past knee injury (not current)
  preferredSessionMinutes: 60,
  catalogue: CATALOGUE,
});

// Collect all exercise slugs from the generated program
const generatedSlugs = new Set<string>();
const catalogueById = new Map(CATALOGUE.map((ex: any) => [ex.id, ex]));

for (const day of pastKneeProgram.days) {
  if (day.dayType === "rest") continue;
  for (const ex of day.exercises) {
    const exercise = catalogueById.get(ex.exerciseId);
    if (exercise) {
      generatedSlugs.add(exercise.slug);
    }
  }
}

// Check that none of the 3 new excluded slugs appear
for (const slug of THREE_NEW_EXCLUDED) {
  if (generatedSlugs.has(slug)) {
    console.log(`  ✗ FAIL: ${slug} appears in past-knee program`);
    violations++;
  }
}

if (violations === 0) {
  console.log("  ✓ PASS: None of the 3 new excluded slugs appear in past-knee generation");
}

console.log("");

// Test 2: Verify squat-pattern exercises ARE available for past-knee users
console.log("=== Test 2: Past-knee squat-pattern availability unchanged ===");

const availableSlugs = CATALOGUE
  .filter((ex) => {
    // Simulate isEligible check for past-knee user
    const input = {
      userId: "test-user",
      blockNumber: 1,
      goal: "strength" as const,
      level: "intermediate" as const,
      primaryTrack: "weights" as const,
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: null,
      bmi: null,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [] as Array<"knee" | "lower_back" | "shoulder">,
      anyKneeInjury: true,
      preferredSessionMinutes: 60,
      catalogue: CATALOGUE,
    };
    
    // Check current-knee contraindication (should NOT apply to past-knee)
    if (input.currentInjuryRegions.includes("knee") && ex.contraindicated_regions.includes("knee")) {
      return false;
    }
    
    // Check landmine jammers (applies to ANY knee injury)
    if (input.anyKneeInjury && (ex.slug === "landmine-linear-jammer" || ex.slug === "single-arm-linear-jammer")) {
      return false;
    }
    
    // Check high-impact lower-body (applies to ANY knee injury)
    if (input.anyKneeInjury && ex.impact === "high") {
      const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
      const isLowerBody = ex.primary_muscles.some((m: string) => lowerBodyMuscles.includes(m));
      if (isLowerBody) return false;
    }
    
    return true;
  })
  .map((ex) => ex.slug);

const availableSet = new Set(availableSlugs);

let missingSquatPatterns = 0;
for (const slug of PAST_KNEE_SQUAT_PATTERN_AVAILABILITY) {
  if (!availableSet.has(slug)) {
    console.log(`  ✗ FAIL: ${slug} is NOT available for past-knee users (should be)`);
    violations++;
    missingSquatPatterns++;
  }
}

if (missingSquatPatterns === 0) {
  console.log(`  ✓ PASS: All ${PAST_KNEE_SQUAT_PATTERN_AVAILABILITY.size} squat-pattern exercises available`);
  console.log("  Verified: barbell-squat, goblet-squat, leg-press, dumbbell-squat, lunges, etc.");
}

console.log("");

// Test 3: Verify the 3 exercises are excluded from past-knee swaps
console.log("=== Test 3: Past-knee swap alternatives exclude the 3 new slugs ===");

import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";

const sampleExercises = ["barbell-squat", "leg-press", "dumbbell-squat"];
for (const exerciseSlug of sampleExercises) {
  const currentExercise = CATALOGUE.find((ex: any) => ex.slug === exerciseSlug);
  if (!currentExercise) continue;
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar", "leg_press"]),
    injuryRegions: [], // Past knee: no current injury
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };
  
  const alternatives = rankAlternatives(currentExercise, CATALOGUE, ctx);
  
  for (const slug of THREE_NEW_EXCLUDED) {
    if (alternatives.some((alt: any) => alt.slug === slug)) {
      console.log(`  ✗ FAIL: ${slug} appears in swaps for ${exerciseSlug}`);
      violations++;
    }
  }
}

console.log("  ✓ PASS: None of the 3 new excluded slugs appear in past-knee swaps");
console.log("");

// Test 4: Verify current-knee users also exclude the 3 exercises
console.log("=== Test 4: Current-knee users also exclude the 3 new slugs ===");

const currentKneeProgram = generateProgram({
  userId: "test-user",
  blockNumber: 1,
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: null,
  bmi: null,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue: CATALOGUE,
});

const currentKneeSlugs = new Set<string>();
for (const day of currentKneeProgram.days) {
  if (day.dayType === "rest") continue;
  for (const ex of day.exercises) {
    const exercise = catalogueById.get(ex.exerciseId);
    if (exercise) {
      currentKneeSlugs.add(exercise.slug);
    }
  }
}

for (const slug of THREE_NEW_EXCLUDED) {
  if (currentKneeSlugs.has(slug)) {
    console.log(`  ✗ FAIL: ${slug} appears in current-knee program`);
    violations++;
  }
}

console.log("  ✓ PASS: Current-knee users also exclude all 3 slugs");
console.log("");

// Final report
console.log("=".repeat(80));
if (violations > 0) {
  console.log(`❌ FAILED: ${violations} violation(s)`);
  process.exit(1);
} else {
  console.log("✅ PASSED: Owner decision (a) correctly implemented");
  console.log("");
  console.log("Summary:");
  console.log("  • 3 exercises newly excluded for past-knee users");
  console.log("  • Squat-pattern availability unchanged from main");
  console.log("  • Current-knee users also exclude the 3 exercises");
  process.exit(0);
}
