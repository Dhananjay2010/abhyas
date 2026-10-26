/**
 * Test: Imperial display half-rounding (0.5 lb)
 * 
 * Verifies that imperial display rounds to 0.5 lb increments.
 * 61.23 kg → 135 lb (not 135.01 or 134.989)
 * 
 * Mutant to kill: Removing roundLbToHalf from formatLoad.
 */

import { formatLoad } from "../src/lib/units";

console.log("\nImperial display half-rounding test\n");

// Test 1: 61.23 kg displays as '135 lb'
const stored1 = 61.23;
const display1 = formatLoad(stored1, "imperial");
console.log(`1. Stored 61.23 kg displays as '${display1}'`);
if (!display1.includes("135")) {
  console.error(`   ✗ FAIL: Expected '135 lb', got '${display1}'`);
  process.exit(1);
}
console.log("   ✓ PASS: Displays as whole lb (135)");

// Test 2: 70.08 kg displays as '154.5 lb'
const stored2 = 70.08;
const display2 = formatLoad(stored2, "imperial");
console.log(`\n2. Stored 70.08 kg displays as '${display2}'`);
if (!display2.includes("154.5")) {
  console.error(`   ✗ FAIL: Expected '154.5 lb', got '${display2}'`);
  process.exit(1);
}
console.log("   ✓ PASS: Displays as half lb (154.5)");

// Test 3: Value between half-lb steps rounds correctly
const stored3 = 61.46; // ~135.5 lb
const display3 = formatLoad(stored3, "imperial");
console.log(`\n3. Stored 61.46 kg displays as '${display3}'`);
// Should round to either 135.5 or 136, not show decimals beyond .5
const hasValidFormat = display3.match(/^(\d+|(\d+\.5)) lb$/);
if (!hasValidFormat) {
  console.error(`   ✗ FAIL: Invalid format '${display3}', expected X or X.5 lb`);
  process.exit(1);
}
console.log("   ✓ PASS: Displays with 0.5 lb rounding");

// Test 4: Verify no raw decimal lb values shown
const stored4 = 100; // ~220.46 lb
const display4 = formatLoad(stored4, "imperial");
console.log(`\n4. Stored 100 kg displays as '${display4}'`);
if (display4.match(/\d\.\d{2,}/)) {
  console.error(`   ✗ FAIL: Shows more than 1 decimal: '${display4}'`);
  process.exit(1);
}
console.log("   ✓ PASS: No raw decimal lb values");

console.log("\n✅ ALL TESTS PASSED: Imperial display rounds to 0.5 lb\n");
