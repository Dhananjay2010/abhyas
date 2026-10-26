/**
 * Test: Metric identity on display
 * 
 * Verifies that metric users see exact stored values, not rounded.
 * 8.75 kg must display as '8.75 kg', not '9 kg'.
 * 11.25 kg must display as '11.25 kg', not '11.5 kg'.
 * 
 * Mutant to kill: Re-adding 0.5 kg rounding to formatLoad for metric.
 */

import { formatLoad } from "../src/lib/units";

console.log("\nMetric identity on display test\n");

// Test 1: 8.75 kg displays as '8.75 kg'
const stored1 = 8.75;
const display1 = formatLoad(stored1, "metric");
console.log(`1. Stored 8.75 kg displays as '${display1}'`);
if (display1 !== "8.75 kg") {
  console.error(`   ✗ FAIL: Expected '8.75 kg', got '${display1}'`);
  process.exit(1);
}
console.log("   ✓ PASS: 8.75 kg displayed exactly");

// Test 2: 11.25 kg displays as '11.25 kg'
const stored2 = 11.25;
const display2 = formatLoad(stored2, "metric");
console.log(`\n2. Stored 11.25 kg displays as '${display2}'`);
if (display2 !== "11.25 kg") {
  console.error(`   ✗ FAIL: Expected '11.25 kg', got '${display2}'`);
  process.exit(1);
}
console.log("   ✓ PASS: 11.25 kg displayed exactly");

// Test 3: 63.75 kg displays as '63.75 kg'
const stored3 = 63.75;
const display3 = formatLoad(stored3, "metric");
console.log(`\n3. Stored 63.75 kg displays as '${display3}'`);
if (display3 !== "63.75 kg") {
  console.error(`   ✗ FAIL: Expected '63.75 kg', got '${display3}'`);
  process.exit(1);
}
console.log("   ✓ PASS: 63.75 kg displayed exactly");

// Test 4: 6.25 kg displays as '6.25 kg'
const stored4 = 6.25;
const display4 = formatLoad(stored4, "metric");
console.log(`\n4. Stored 6.25 kg displays as '${display4}'`);
if (display4 !== "6.25 kg") {
  console.error(`   ✗ FAIL: Expected '6.25 kg', got '${display4}'`);
  process.exit(1);
}
console.log("   ✓ PASS: 6.25 kg displayed exactly");

// Test 5: Whole numbers still display without decimals
const stored5 = 9;
const display5 = formatLoad(stored5, "metric");
console.log(`\n5. Stored 9 kg displays as '${display5}'`);
if (display5 !== "9 kg") {
  console.error(`   ✗ FAIL: Expected '9 kg', got '${display5}'`);
  process.exit(1);
}
console.log("   ✓ PASS: 9 kg displayed without unnecessary decimals");

console.log("\n✅ ALL TESTS PASSED: Metric display identity preserved\n");
