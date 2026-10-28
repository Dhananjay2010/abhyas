#!/usr/bin/env npx tsx
/**
 * W5: shouldTriggerBannedCleanup must return true when cleanup changed exercises.
 * 
 * W5 mutant: returns constant false - background sweep never triggered.
 * This test ensures the function returns true when cleaned list differs from persisted,
 * and false when they're the same.
 */

import { shouldTriggerBannedCleanup } from "../src/lib/today/should-trigger-cleanup";

console.log("Testing W5: shouldTriggerBannedCleanup decision\n");

// Case 1: No changes - should return false
const noChanges = [
  { changed: false },
  { changed: false },
  { changed: false },
];

const result1 = shouldTriggerBannedCleanup(noChanges);
if (result1 !== false) {
  console.error("✗ FAIL: Should return false when no changes");
  console.error(`  Expected: false`);
  console.error(`  Got:      ${result1}`);
  process.exit(1);
}

// Case 2: Some changes - should return true
const someChanges = [
  { changed: false },
  { changed: true },
  { changed: false },
];

const result2 = shouldTriggerBannedCleanup(someChanges);
if (result2 !== true) {
  console.error("✗ FAIL: W5 - Should return true when some exercises changed");
  console.error(`  W5 mutant: return false (constant)`);
  console.error(`  Expected: true (trigger cleanup)`);
  console.error(`  Got:      ${result2}`);
  process.exit(1);
}

// Case 3: All changes - should return true
const allChanges = [
  { changed: true },
  { changed: true },
];

const result3 = shouldTriggerBannedCleanup(allChanges);
if (result3 !== true) {
  console.error("✗ FAIL: Should return true when all exercises changed");
  console.error(`  Expected: true`);
  console.error(`  Got:      ${result3}`);
  process.exit(1);
}

// Case 4: Empty - should return false
const empty: Array<{ changed: boolean }> = [];

const result4 = shouldTriggerBannedCleanup(empty);
if (result4 !== false) {
  console.error("✗ FAIL: Should return false for empty array");
  console.error(`  Expected: false`);
  console.error(`  Got:      ${result4}`);
  process.exit(1);
}

console.log("✓ PASS: W5 killed - shouldTriggerBannedCleanup correctly detects changes");
console.log(`  No changes:   false ✓`);
console.log(`  Some changes: true ✓`);
console.log(`  All changes:  true ✓`);
console.log(`  Empty:        false ✓`);
