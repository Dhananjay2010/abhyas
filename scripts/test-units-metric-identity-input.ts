/**
 * Test: Metric identity on input
 * 
 * Verifies that metric users can save exact decimal values without rounding.
 * 11.25 kg must save as 11.25 kg, 63.75 kg must save as 63.75 kg.
 * 
 * Mutant to kill: Re-adding 0.5 kg rounding to displayToKg for metric.
 */

import { displayToKg } from "../src/lib/units";

console.log("\nMetric identity on input test\n");

// Test 1: 11.25 kg stores exactly
const input1 = 11.25;
const stored1 = displayToKg(input1, "metric");
console.log(`1. Input 11.25 kg stores as ${stored1} kg`);
if (stored1 !== 11.25) {
  console.error(`   ✗ FAIL: Expected 11.25, got ${stored1}`);
  process.exit(1);
}
console.log("   ✓ PASS: 11.25 kg stored exactly");

// Test 2: 63.75 kg stores exactly  
const input2 = 63.75;
const stored2 = displayToKg(input2, "metric");
console.log(`\n2. Input 63.75 kg stores as ${stored2} kg`);
if (stored2 !== 63.75) {
  console.error(`   ✗ FAIL: Expected 63.75, got ${stored2}`);
  process.exit(1);
}
console.log("   ✓ PASS: 63.75 kg stored exactly");

// Test 3: 8.75 kg stores exactly
const input3 = 8.75;
const stored3 = displayToKg(input3, "metric");
console.log(`\n3. Input 8.75 kg stores as ${stored3} kg`);
if (stored3 !== 8.75) {
  console.error(`   ✗ FAIL: Expected 8.75, got ${stored3}`);
  process.exit(1);
}
console.log("   ✓ PASS: 8.75 kg stored exactly");

// Test 4: 6.25 kg stores exactly
const input4 = 6.25;
const stored4 = displayToKg(input4, "metric");
console.log(`\n4. Input 6.25 kg stores as ${stored4} kg`);
if (stored4 !== 6.25) {
  console.error(`   ✗ FAIL: Expected 6.25, got ${stored4}`);
  process.exit(1);
}
console.log("   ✓ PASS: 6.25 kg stored exactly");

console.log("\n✅ ALL TESTS PASSED: Metric identity preserved\n");
