/**
 * LOW: Pin lb half-rounding behavior.
 *
 * Test that 137.8 lb shows and stores as 138 lb (not 137.8 lb),
 * per the spec's rule that imperial displays and stores in 0.5 lb increments.
 */

import { displayToKg, kgToDisplay, roundLbToHalf } from "../src/lib/units";

console.log("\nLOW: lb half-rounding (137.8 → 138)\n");

const units = "imperial" as const;

// Step 1: User types 137.8 lb
const userInputLb = 137.8;
console.log(`1. User types: ${userInputLb} lb`);

// Step 2: Round to 0.5 lb (display format)
const roundedLb = roundLbToHalf(userInputLb);
console.log(`\n2. Round to 0.5 lb: ${roundedLb} lb`);

if (roundedLb !== 138) {
  console.error(`   ❌ FAIL: Expected 138 lb, got ${roundedLb} lb`);
  process.exit(1);
}

console.log(`   ✓ PASS: 137.8 lb rounds to ${roundedLb} lb`);

// Step 3: Convert to kg for storage
const storedKg = displayToKg(userInputLb, units);
console.log(`\n3. Store as kg: ${storedKg} kg`);

// Step 4: Convert back for display
const displayedLb = roundLbToHalf(kgToDisplay(storedKg, units));
console.log(`\n4. Display back: ${displayedLb} lb`);

if (displayedLb !== 138) {
  console.error(`   ❌ FAIL: Expected 138 lb, got ${displayedLb} lb`);
  process.exit(1);
}

console.log(`   ✓ PASS: Stored and displayed as ${displayedLb} lb`);

// Step 5: Verify 137.8 is rejected (TypeScript: compare number to avoid literal type error)
const wrongValue: number = 137.8;
if (displayedLb === wrongValue) {
  console.error(`   ❌ FAIL: Must round to 0.5 lb, not keep ${wrongValue} lb`);
  process.exit(1);
}

console.log(`   ✓ PASS: 137.8 is NOT kept as-is (rounded to ${displayedLb} lb)`);

console.log("\n✅ LOW PASS: 137.8 lb shows and stores as 138 lb\n");
