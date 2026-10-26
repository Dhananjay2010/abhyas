/**
 * Behavioral test for L-3: weightKgToSubmit preserves original kg when unchanged.
 * 
 * Tests the extracted weightKgToSubmit function used by SetEntry:
 * - Unedited prefill returns original kg
 * - Edited value converts normally
 * - Edit back to same string still returns original kg
 * - Empty returns null
 * - Metric works correctly
 */

import { weightKgToSubmit, computeRunnerWeightPrefill } from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== Test weightKgToSubmit (L-3 fix) ===\n");

// Test case 1: Unedited prefill preserves original kg (72.5 kg case)
const originalKg1 = 72.5;
const prefill1 = computeRunnerWeightPrefill(originalKg1, "imperial", false);
const result1 = weightKgToSubmit(prefill1, prefill1, originalKg1, "imperial");

check(
  "72.5 kg: unedited prefill returns original 72.5 kg",
  result1 === originalKg1,
  `prefill="${prefill1}", got ${result1} kg`
);

// Test case 2: Edited value converts normally
const result2 = weightKgToSubmit("165", prefill1, originalKg1, "imperial");
check(
  "72.5 kg: editing to 165 lb converts normally",
  result2 !== null && Math.abs(result2 - 74.84) < 0.1,
  `got ${result2} kg`
);

// Test case 3: Edit back to same string returns original (not converted)
const editedBack = weightKgToSubmit(prefill1, prefill1, originalKg1, "imperial");
check(
  "72.5 kg: edit back to same string returns original",
  editedBack === originalKg1,
  `got ${editedBack} kg`
);

// Test case 4: Empty returns null
const result4 = weightKgToSubmit("", prefill1, originalKg1, "imperial");
check(
  "Empty weight returns null",
  result4 === null,
  `got ${result4}`
);

// Test case 5: Metric unedited prefill
const originalKg5 = 80;
const prefill5 = computeRunnerWeightPrefill(originalKg5, "metric", false);
const result5 = weightKgToSubmit(prefill5, prefill5, originalKg5, "metric");

check(
  "80 kg metric: unedited prefill returns original",
  result5 === originalKg5,
  `prefill="${prefill5}", got ${result5} kg`
);

// Test case 6: Metric edited value
const result6 = weightKgToSubmit("85", prefill5, originalKg5, "metric");
check(
  "80 kg metric: editing to 85 converts normally",
  result6 === 85,
  `got ${result6} kg`
);

// Test case 7: No defaultWeight (first set)
const prefill7 = "";
const result7 = weightKgToSubmit("135", prefill7, null, "imperial");
check(
  "No defaultWeight: converts normally",
  result7 !== null && Math.abs(result7 - 61.23) < 0.1,
  `got ${result7} kg`
);

// Test case 8: 85 kg case (rounds vs floors)
const originalKg8 = 85;
const prefill8 = computeRunnerWeightPrefill(originalKg8, "imperial", false);
const result8 = weightKgToSubmit(prefill8, prefill8, originalKg8, "imperial");

check(
  "85 kg: unedited prefill returns original 85 kg",
  result8 === originalKg8,
  `prefill="${prefill8}", got ${result8} kg`
);

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
