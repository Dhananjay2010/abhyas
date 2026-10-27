#!/usr/bin/env tsx
/**
 * Unit tests for rankAlternatives defense-in-depth checks
 * Tests call rankAlternatives directly with specific unfiltered candidates
 * to prove the filters inside rankAlternatives work correctly.
 */

import { readFileSync } from "fs";
import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

let violations = 0;

console.log("=".repeat(80));
console.log("RANKALTERNATIVES DEFENSE-IN-DEPTH TESTS");
console.log("Tests call rankAlternatives directly with unfiltered candidates");
console.log("=".repeat(80));
console.log("");

// Test 1: Tag-based knee contraindication for CURRENT knee (survivors 2a, 5a1)
console.log("=== Test 1: Tag-based contraindication (current-knee) ===");

const leg_press = catalogue.find(ex => ex.slug === "leg-press");
const dumbbell_squat = catalogue.find(ex => ex.slug === "dumbbell-squat");

if (leg_press && dumbbell_squat) {
  console.log(`Testing: dumbbell-squat (contraindicated: ${dumbbell_squat.contraindicated_regions.join(", ")})`);
  console.log(`Current exercise: leg-press (pattern: ${leg_press.movement_pattern})`);
  console.log(`Candidate: dumbbell-squat (pattern: ${dumbbell_squat.movement_pattern})`);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["dumbbell"]),
    injuryRegions: ["knee"],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };
  
  // Pass dumbbell-squat directly as a candidate (same pattern as leg-press)
  const alternatives = rankAlternatives(leg_press, [dumbbell_squat], ctx);
  
  if (alternatives.length > 0) {
    console.log(`  ✗ FAIL: rankAlternatives returned dumbbell-squat for current-knee`);
    violations++;
  } else {
    console.log(`  ✓ PASS: dumbbell-squat excluded for current-knee via tag check`);
  }
} else {
  console.log(`  ⚠ SKIP: Test exercises not found`);
}

console.log("");

// Test 2: High-impact filter for knee injuries (survivor 5a2)
console.log("=== Test 2: High-impact lower-body exclusion (any knee) ===");

const box_jump = catalogue.find(ex => ex.slug === "box-jump");
if (leg_press && box_jump) {
  console.log(`Testing: box-jump (impact: ${box_jump.impact}, muscles: ${box_jump.primary_muscles.join(", ")})`);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["box"]),
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };
  
  const alternatives = rankAlternatives(leg_press, [box_jump], ctx);
  
  if (alternatives.length > 0) {
    console.log(`  ✗ FAIL: rankAlternatives returned box-jump for knee injury`);
    violations++;
  } else {
    console.log(`  ✓ PASS: box-jump excluded for knee injury via high-impact filter`);
  }
}

console.log("");

// Test 3: Sissy squat ban (survivor sissy-in-alternatives)
console.log("=== Test 3: Sissy squat exclusion (any knee) ===");

const weighted_sissy = catalogue.find(ex => ex.slug === "weighted-sissy-squat");
if (leg_press && weighted_sissy) {
  console.log(`Testing: weighted-sissy-squat`);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["dumbbell"]),
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };
  
  const alternatives = rankAlternatives(leg_press, [weighted_sissy], ctx);
  
  if (alternatives.length > 0) {
    console.log(`  ✗ FAIL: rankAlternatives returned sissy squat for knee injury`);
    violations++;
  } else {
    console.log(`  ✓ PASS: sissy squat excluded for knee injury`);
  }
}

console.log("");

// Test 4: Current-knee contraindication (survivor 5h)
// This tests that step-ups/split-squats are excluded for current-knee
// even though they might be in KNEE_SAFE_LUNGE_EXERCISES
console.log("=== Test 4: Step-ups excluded for current-knee ===");

const barbell_step_ups = catalogue.find(ex => ex.slug === "barbell-step-ups");
if (leg_press && barbell_step_ups) {
  console.log(`Testing: barbell-step-ups (contraindicated: ${barbell_step_ups.contraindicated_regions.join(", ")})`);
  
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["barbell"]),
    injuryRegions: ["knee"],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };
  
  const alternatives = rankAlternatives(leg_press, [barbell_step_ups], ctx);
  
  if (alternatives.length > 0) {
    console.log(`  ✗ FAIL: rankAlternatives returned step-ups for current-knee`);
    violations++;
  } else {
    console.log(`  ✓ PASS: step-ups excluded for current-knee`);
  }
}

console.log("");

// Final report
console.log("=".repeat(80));
if (violations > 0) {
  console.log(`❌ FAILED: ${violations} violation(s)`);
  console.log("");
  console.log("rankAlternatives defense-in-depth checks failed");
  process.exit(1);
} else {
  console.log("✅ PASSED: All defense-in-depth checks working");
  console.log("");
  console.log("These checks provide defense-in-depth protection if rankAlternatives");
  console.log("is called with unfiltered candidate lists.");
  process.exit(0);
}
