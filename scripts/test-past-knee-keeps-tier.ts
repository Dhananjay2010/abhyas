#!/usr/bin/env tsx
/**
 * Test that past-knee users maintain access to main's tier in rankAlternatives
 * 
 * Mutant target: Adding global tag filtering `if ((ctx.anyKneeInjury ?? false) && 
 * candidate.contraindicated_regions.includes("knee")) continue;` BEFORE pattern-specific
 * logic would incorrectly filter ALL knee-tagged exercises across ALL contexts.
 * 
 * Owner decision (a): Tag-based contraindication applies to CURRENT knee only.
 * Past-knee users have context-specific filtering (e.g., squat→squat has isKneeRiskForKneeUser),
 * but NOT global tag filtering that would eliminate entire patterns.
 * 
 * This test verifies: For past-knee users swapping LUNGE exercises,
 * non-excluded knee-tagged lunge options ARE still available (not globally filtered).
 */

import { readFileSync } from "fs";
import { rankAlternatives } from "../src/lib/program/alternatives";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

console.log("Testing past-knee lunge swaps include knee-tagged lunges");
console.log("=".repeat(70));

let violations = 0;

// Find a knee-tagged lunge that's NOT in PAST_KNEE_EXCLUDED_SLUGS
// Example: barbell-step-ups is knee-tagged but should still be available
const stepUps = catalogue.find(ex => ex.slug === "barbell-step-ups");
if (!stepUps) {
  console.error("✗ FAIL: barbell-step-ups not found in catalogue");
  process.exit(1);
}

console.log(`Target: ${stepUps.name} (${stepUps.slug})`);
console.log(`  Pattern: ${stepUps.movement_pattern}`);
console.log(`  Tagged: ${stepUps.contraindicated_regions.join(", ")}`);
console.log('');

// Pick a different lunge to generate swaps from
const dumbbellLunge = catalogue.find(ex => ex.slug === "dumbbell-lunges");
if (!dumbbellLunge) {
  console.error("✗ FAIL: dumbbell-lunges not found in catalogue");
  process.exit(1);
}

console.log(`Source: ${dumbbellLunge.name} (${dumbbellLunge.slug})`);
console.log('');

// Generate swaps for past-knee user
const swaps = rankAlternatives(
  dumbbellLunge,
  catalogue.filter(c => c.movement_pattern === "lunge"),
  {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [], // Past knee, not current
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 0,
    tieBreakFn: () => 0,
  }
);

const hasStepUps = swaps.some(s => s.slug === "barbell-step-ups" || s.slug === "dumbbell-step-ups");

console.log(`Lunge swaps: ${swaps.map(s => s.slug).join(", ")}`);
console.log('');

if (!hasStepUps) {
  console.log(`  ✗ FAIL: step-ups NOT in past-knee lunge swap list`);
  console.log(`  Global tag filtering would block knee-tagged lunges!`);
  violations++;
} else {
  console.log(`  ✓ PASS: step-ups (knee-tagged) available in lunge swaps`);
}

console.log("=".repeat(70));

if (violations > 0) {
  console.error(`\n❌ FAILED: ${violations} violation(s)`);
  console.error("Global tag filtering was incorrectly applied!");
  process.exit(1);
} else {
  console.log("\n✅ PASSED: Past-knee users keep main's tier (context-specific filtering only)");
  process.exit(0);
}
