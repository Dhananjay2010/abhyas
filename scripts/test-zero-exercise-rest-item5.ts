#!/usr/bin/env npx tsx
/**
 * Item 5: Zero-exercise day becomes rest after cleanup.
 * 
 * When a weights/bodyweight day loses all exercises due to injury cleanup
 * and no alternatives exist, isRestAfterCleanup returns true and the day
 * type changes to "rest".
 * 
 * Item 5 mutant: day_type unchanged - zero-exercise days remain "weights".
 */

import { isRestAfterCleanup } from "../src/lib/today/classify-zero-exercise-day";

console.log("Testing Item 5: Zero-exercise day becomes rest\n");

// Case 1: Weights day with 0 exercises -> rest
const result1 = isRestAfterCleanup("weights", []);
if (result1 !== true) {
  console.error("✗ FAIL: Item 5 - Weights day with 0 exercises must become rest");
  console.error(`  Item 5 mutant: day_type unchanged`);
  console.error(`  Expected: true (becomes rest)`);
  console.error(`  Got:      ${result1}`);
  process.exit(1);
}

// Case 2: Bodyweight day with 0 exercises -> rest
const result2 = isRestAfterCleanup("bodyweight", []);
if (result2 !== true) {
  console.error("✗ FAIL: Bodyweight day with 0 exercises must become rest");
  console.error(`  Expected: true`);
  console.error(`  Got:      ${result2}`);
  process.exit(1);
}

// Case 3: Weights day with exercises -> not rest
const result3 = isRestAfterCleanup("weights", [{ id: "ex1" }]);
if (result3 !== false) {
  console.error("✗ FAIL: Weights day with exercises should not become rest");
  console.error(`  Expected: false`);
  console.error(`  Got:      ${result3}`);
  process.exit(1);
}

// Case 4: Rest day with 0 exercises -> already rest (no change needed)
const result4 = isRestAfterCleanup("rest", []);
if (result4 !== false) {
  console.error("✗ FAIL: Rest day should not be classified as needing rest conversion");
  console.error(`  Expected: false (already rest)`);
  console.error(`  Got:      ${result4}`);
  process.exit(1);
}

// Case 5: Yoga day with 0 exercises -> not converted to rest
const result5 = isRestAfterCleanup("yoga", []);
if (result5 !== false) {
  console.error("✗ FAIL: Yoga day should not become rest");
  console.error(`  Expected: false`);
  console.error(`  Got:      ${result5}`);
  process.exit(1);
}

console.log("✓ PASS: Item 5 - Zero-exercise training days correctly classified as rest");
console.log(`  Weights + 0 exercises:     rest ✓`);
console.log(`  Bodyweight + 0 exercises:  rest ✓`);
console.log(`  Weights + 1 exercise:      not rest ✓`);
console.log(`  Rest + 0 exercises:        not converted ✓`);
console.log(`  Yoga + 0 exercises:        not converted ✓`);
