#!/usr/bin/env tsx
/**
 * Test that calf-press-on-the-leg-press-machine is excluded from past-knee calf exercise swap lists
 * 
 * Mutant target: Removing calf-press from PAST_KNEE_EXCLUDED_SLUGS would put it back into
 * 36 past-knee swap lists, breaking the exclusion.
 */

import { readFileSync } from "fs";
import { rankAlternatives } from "../src/lib/program/alternatives";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

// Find all calf exercises in the catalogue
const calfExercises = catalogue.filter(ex => ex.movement_pattern === "calf");

console.log("Testing past-knee calf swap lists exclude calf-press");
console.log("=".repeat(70));
console.log(`Found ${calfExercises.length} calf exercises in catalogue`);

let violations = 0;

// For each calf exercise, generate swap list for past-knee user and verify calf-press is excluded
for (const calfEx of calfExercises) {
  const swaps = rankAlternatives(
    calfEx,
    catalogue.filter(c => c.movement_pattern === calfEx.movement_pattern),
    {
      level: "intermediate",
      availableEquipment: null, // All equipment
      injuryRegions: [], // Past knee, not current
      anyKneeInjury: true,
      limit: 5,
      scoreFn: () => 0,
      tieBreakFn: () => 0,
    }
  );

  // Check if calf-press appears in the swap list
  const hasCalfPress = swaps.some(s => s.slug === "calf-press-on-the-leg-press-machine");
  
  if (hasCalfPress) {
    console.log(`  ✗ FAIL: ${calfEx.slug} → calf-press appears in swap list for past-knee`);
    violations++;
  }
}

if (violations === 0) {
  console.log(`  ✓ PASS: calf-press excluded from all ${calfExercises.length} past-knee calf swap lists`);
}

console.log("=".repeat(70));

if (violations > 0) {
  console.error(`\n❌ FAILED: ${violations} violation(s)`);
  process.exit(1);
} else {
  console.log("\n✅ PASSED: calf-press correctly excluded from past-knee calf swaps");
  process.exit(0);
}
