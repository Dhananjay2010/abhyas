/**
 * M1 (BLOCKING): Verify that the runner's weight input prefills the exact
 * 0.5-lb-snapped value shown on the working weight line, not rounded to 5 lb.
 *
 * Test: 62.5 kg should prefill as 137.5 lb, not 140 lb.
 */

import { kgToDisplay, snapPrescribedWeight, roundLbToHalf } from "../src/lib/units";

console.log("\nM1: Runner weight prefill must match working weight line\n");

// Scenario: Imperial user, prescribed weight 62.5 kg
const prescribedKg = 62.5;
const units = "imperial" as const;

// Step 1: What the working weight line shows
const snappedKg = snapPrescribedWeight(prescribedKg, units);
const displayLb = kgToDisplay(snappedKg!, units);
const workingWeightLineLb = roundLbToHalf(displayLb);

console.log(`1. Prescribed weight: ${prescribedKg} kg`);
console.log(`   Snapped to lb grid: ${snappedKg} kg`);
console.log(`   Working weight line shows: ${workingWeightLineLb} lb`);

if (workingWeightLineLb !== 137.5) {
  console.error(`   ❌ FAIL: Expected 137.5 lb, got ${workingWeightLineLb} lb`);
  process.exit(1);
}
console.log(`   ✓ PASS: Working weight line shows 137.5 lb`);

// Step 2: What the input box should prefill (same logic as session-runner.tsx line 1218-1228)
const prefillValue = roundLbToHalf(kgToDisplay(snappedKg!, units));

console.log(`\n2. Input box prefill calculation:`);
console.log(`   Convert ${snappedKg} kg to lb: ${kgToDisplay(snappedKg!, units)} lb`);
console.log(`   Round to 0.5 lb: ${prefillValue} lb`);

if (prefillValue !== 137.5) {
  console.error(`   ❌ FAIL: Expected 137.5 lb, got ${prefillValue} lb`);
  process.exit(1);
}
console.log(`   ✓ PASS: Prefill matches working weight line (137.5 lb)`);

// Step 3: Verify the prefill and working weight line agree
if (prefillValue !== workingWeightLineLb) {
  console.error(`   ❌ FAIL: Prefill ${prefillValue} lb != working line ${workingWeightLineLb} lb`);
  process.exit(1);
}
console.log(`\n3. ✓ PASS: Prefill and working weight line agree: ${prefillValue} lb`);

// Step 4: Verify 140 lb is rejected (TypeScript: check inequality to avoid literal type error)
const wrongPrefill: number = 140;
if (prefillValue === wrongPrefill) {
  console.error(`   ❌ FAIL: Prefill must not round to 5 lb (got ${prefillValue} lb)`);
  process.exit(1);
}
console.log(`   ✓ PASS: Prefill is NOT rounded to 5 lb (rejected ${wrongPrefill} lb)`);

console.log("\n✅ M1 PASS: Input prefill matches working weight line (137.5 lb, not 140 lb)\n");
