/**
 * Test: No PB when logging prefilled lb value (M1)
 * 
 * Verifies that when stored best is 62.5 kg and imperial user logs 
 * the prefilled lb value (137.5 lb → 62.5 kg), no PB fires.
 * 
 * This test verifies that snapPrescribedWeight produces a value that,
 * when logged, matches the prescription at stored precision.
 */

import { snapPrescribedWeight, displayToKg, formatLoad } from "../src/lib/units";

console.log("\nNo PB on prefilled lb value test\n");

const units = "imperial";
const storedBestKg = 62.5;

console.log(`1. Stored best: ${storedBestKg} kg`);
console.log(`   Imperial display: ${formatLoad(storedBestKg, units)}`);

// What the session runner prefills
const prefilled = snapPrescribedWeight(storedBestKg, units);
console.log(`\n2. Prefilled weight: ${prefilled} kg`);

if (prefilled === null) {
  console.error("   ✗ FAIL: Prefill returned null");
  process.exit(1);
}

// User logs the prefilled value
// In the UI, they see the lb value, which gets converted back
const displayedLb = Math.round((prefilled / 0.45359237) * 2) / 2; // roundLbToHalf
console.log(`   Displayed to user as: ${displayedLb} lb`);

// User clicks Log set without changing it
const loggedKg = displayToKg(displayedLb, units);
console.log(`   Logged as: ${loggedKg} kg`);

// Compare at stored precision (0.01 kg)
const roundedLogged = Math.round(loggedKg * 100) / 100;
const roundedBest = Math.round(storedBestKg * 100) / 100;

console.log(`\n3. Comparison at 0.01 kg precision:`);
console.log(`   Logged: ${roundedLogged} kg`);
console.log(`   Best:   ${roundedBest} kg`);

if (roundedLogged > roundedBest) {
  console.error(`   ✗ FAIL: Would fire PB (${roundedLogged} > ${roundedBest})`);
  process.exit(1);
}

console.log(`   ✓ PASS: No PB fires (${roundedLogged} <= ${roundedBest})`);

// Test 2: Verify the snapped prescription is conservative (rounds down)
console.log(`\n4. Verify prescription snapping:`);
console.log(`   Original: ${storedBestKg} kg`);
console.log(`   Snapped:  ${prefilled} kg`);

if (prefilled > storedBestKg) {
  console.error(`   ✗ FAIL: Snapped value exceeds prescription`);
  process.exit(1);
}
// Allow up to 0.5 lb difference (~0.23 kg) due to conservative rounding
if (Math.abs(prefilled - storedBestKg) > 0.25) {
  console.error(`   ✗ FAIL: Snapped value differs by more than 0.25 kg`);
  process.exit(1);
}
console.log(`   ✓ PASS: Snapped value conservative (rounds down, within 0.25 kg)`);

console.log("\n✅ ALL TESTS PASSED: No PB on prefilled lb value\n");
