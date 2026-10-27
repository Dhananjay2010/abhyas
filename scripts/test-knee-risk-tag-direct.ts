#!/usr/bin/env tsx
/**
 * Test isKneeRiskForKneeUser directly with knee-tagged exercises
 * Kills K1 mutant: "Ignore explicit knee tag in isKneeRiskForKneeUser"
 */

import { readFileSync } from "fs";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

console.log("Testing isKneeRiskForKneeUser with knee-tagged exercises");
console.log("=".repeat(70));

let violations = 0;

// Find calf-press: has explicit knee tag but NOT squat/lunge pattern
// This kills K1 because removing the explicit tag check won't be caught by derived check
const calfPress = catalogue.find(ex => ex.slug === "calf-press-on-the-leg-press-machine");

if (!calfPress) {
  console.error("✗ FAIL: calf-press-on-the-leg-press-machine not found");
  process.exit(1);
}

console.log(`Testing with: ${calfPress.name} (${calfPress.slug})`);
console.log(`  movement_pattern: ${calfPress.movement_pattern}`);
console.log(`  contraindicated_regions: ${calfPress.contraindicated_regions.join(", ")}`);

// Test 1: Calf-press has explicit knee tag and should return true
const result1 = isKneeRiskForKneeUser(calfPress, true);
if (!result1) {
  console.log(`  ✗ FAIL: isKneeRiskForKneeUser returned false for knee-tagged calf-press`);
  console.log(`        This means K1 mutant (removing explicit tag check) survived!`);
  violations++;
} else {
  console.log(`  ✓ PASS: Returns true for knee-tagged calf-press`);
}

// Test 2: Non-tagged, non-squat/lunge exercise should return false
const gluteBridge = catalogue.find(ex => ex.slug === "glute-bridge");

if (gluteBridge) {
  console.log(`\nTesting with: ${gluteBridge.name} (${gluteBridge.slug})`);
  console.log(`  movement_pattern: ${gluteBridge.movement_pattern}`);
  console.log(`  contraindicated_regions: ${gluteBridge.contraindicated_regions.join(", ") || "none"}`);
  
  const result2 = isKneeRiskForKneeUser(gluteBridge, true);
  if (result2) {
    console.log(`  ✗ FAIL: isKneeRiskForKneeUser returned true for non-tagged glute-bridge`);
    violations++;
  } else {
    console.log(`  ✓ PASS: Returns false for non-tagged glute-bridge`);
  }
}

console.log("=".repeat(70));

if (violations > 0) {
  console.error(`\n❌ FAILED: ${violations} violation(s)`);
  process.exit(1);
} else {
  console.log("\n✅ PASSED: isKneeRiskForKneeUser correctly identifies knee-tagged exercises");
  process.exit(0);
}
