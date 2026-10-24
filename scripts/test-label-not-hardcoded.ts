#!/usr/bin/env tsx
/**
 * Test for label-hardcoded mutant (m0-label-hardcoded).
 * 
 * This test verifies that plannableDays uses actual labels from program_days,
 * not hardcoded strings.
 */

import { labelForDayType } from "../src/lib/program/day-plan";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test: Labels must use actual label, not hardcoded ===\n");

// Test labelForDayType with different labels
const pushLabel = labelForDayType("weights", "Push");
const pullLabel = labelForDayType("weights", "Pull");
const legsLabel = labelForDayType("weights", "Legs");
const customLabel = labelForDayType("bodyweight", "Core Work");

console.log(`Push label: ${pushLabel}`);
console.log(`Pull label: ${pullLabel}`);
console.log(`Legs label: ${legsLabel}`);
console.log(`Custom label: ${customLabel}`);

assert(pushLabel === "Push", "Must return 'Push', not hardcoded");
assert(pullLabel === "Pull", "Must return 'Pull', not hardcoded");
assert(legsLabel === "Legs", "Must return 'Legs', not hardcoded");
assert(customLabel === "Core Work", "Must return 'Core Work', not hardcoded");

// All labels must be different
assert(pushLabel !== pullLabel, "Push and Pull must be different");
assert(pushLabel !== legsLabel, "Push and Legs must be different");
assert(pullLabel !== legsLabel, "Pull and Legs must be different");

// Must not return a hardcoded string
assert(pushLabel !== "Hardcoded", "Must not return hardcoded string");
assert(pushLabel !== "Training", "Must not return generic 'Training' for custom label");

console.log("\n✅ Label test passed\n");
