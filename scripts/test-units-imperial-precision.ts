/**
 * Test: Imperial 0.01-kg rounding precision
 * 
 * Verifies that imperial input is stored with 0.01 kg precision.
 * 135 lb → 61.23 kg (not 61.2 or 61.235)
 * 
 * Mutant to kill: Removing 0.01 kg rounding from displayToKg.
 */

import { displayToKg } from "../src/lib/units";

console.log("\nImperial 0.01-kg precision test\n");

// Test 1: 135 lb converts to 61.23 kg (0.01 precision)
const input1 = 135;
const stored1 = displayToKg(input1, "imperial");
console.log(`1. Input 135 lb stores as ${stored1} kg`);
// 135 lb = 61.2349081... kg, should round to 61.23
if (Math.abs(stored1 - 61.23) > 0.005) {
  console.error(`   ✗ FAIL: Expected ~61.23 kg, got ${stored1}`);
  process.exit(1);
}
console.log("   ✓ PASS: Stored with 0.01 kg precision");

// Test 2: 154.5 lb converts with 0.01 precision
const input2 = 154.5;
const stored2 = displayToKg(input2, "imperial");
console.log(`\n2. Input 154.5 lb stores as ${stored2} kg`);
// 154.5 lb = 70.08... kg
if (Math.abs(stored2 - 70.08) > 0.005) {
  console.error(`   ✗ FAIL: Expected ~70.08 kg, got ${stored2}`);
  process.exit(1);
}
console.log("   ✓ PASS: Stored with 0.01 kg precision");

// Test 3: Verify precision is exactly 2 decimal places
const input3 = 220.5;
const stored3 = displayToKg(input3, "imperial");
console.log(`\n3. Input 220.5 lb stores as ${stored3} kg`);
const decimalPart = stored3.toString().split('.')[1] || '';
if (decimalPart.length > 2) {
  console.error(`   ✗ FAIL: Too many decimal places: ${decimalPart.length}`);
  process.exit(1);
}
console.log(`   ✓ PASS: Exactly ${decimalPart.length} decimal places`);

console.log("\n✅ ALL TESTS PASSED: Imperial 0.01-kg precision maintained\n");
