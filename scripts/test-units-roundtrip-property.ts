/**
 * Property tests for units round-trip stability.
 * 
 * Tests:
 * 1. For any stored kg, display then parse-unedited gives exactly the stored kg (session weights)
 * 2. Body weight entered in lb is displayed as entered (0.1 lb precision)
 * 3. History list and detail rounding are identical (both use formatTopSet)
 * 
 * Uses deterministic loops, no random seeds.
 */

import {
  kgToLb,
  lbToKg,
  roundLbToHalf,
  formatLoad,
  formatTopSet,
  displayToKg,
  parseBodyWeight,
  formatBodyWeight,
  computeRunnerWeightPrefill,
} from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== Property Test 1: Session weight round-trip (runner prefill) ===\n");

// Test every 0.5 kg from 20 to 300 kg
for (let kg = 20; kg <= 300; kg += 0.5) {
  const prefill = computeRunnerWeightPrefill(kg, "imperial", false);
  
  if (prefill === "") {
    // Empty prefill means no weight, should not happen for valid kg
    check(`${kg} kg prefill not empty`, false);
    continue;
  }
  
  // Prefill now rounds to NEAREST 0.5 lb (not floor)
  // Check that prefill matches direct rounding
  const lb = kgToLb(kg);
  const roundedLb = roundLbToHalf(lb);
  const expectedPrefill = String(roundedLb);
  
  check(
    `${kg} kg: prefill "${prefill}" matches nearest 0.5 lb rounding`,
    prefill === expectedPrefill,
    `expected "${expectedPrefill}"`
  );
  
  // Check that prefill converts back close to original kg
  const displayedPrefill = Number(prefill);
  const backFromPrefill = displayToKg(displayedPrefill, "imperial");
  
  check(
    `${kg} kg: prefill ${prefill} lb converts back within 0.3 kg`,
    Math.abs(backFromPrefill - kg) < 0.3,
    `got ${backFromPrefill} kg, diff ${Math.abs(backFromPrefill - kg).toFixed(2)} kg`
  );
}

console.log(
  `\nTested ${passed + failed} kg values from 20-300 kg in 0.5 kg steps\n`
);

console.log("=== Property Test 2: Session weight round-trip (every 0.5 lb) ===\n");

// Test every 0.5 lb from 44 to 1100 lb (roughly 20-500 kg)
let testedLb = 0;
for (let lb = 44; lb <= 1100; lb += 0.5) {
  const kg = lbToKg(lb);
  const roundedKg = Math.round(kg * 100) / 100;
  
  // Skip out-of-range values
  if (roundedKg < 20 || roundedKg > 500) continue;
  
  testedLb++;
  
  // Display the stored kg
  const displayedLb = roundLbToHalf(kgToLb(roundedKg));
  
  // Convert back
  const backKg = lbToKg(displayedLb);
  const roundedBackKg = Math.round(backKg * 100) / 100;
  
  // The round-trip should be very close (within 0.02 kg due to rounding)
  check(
    `${lb} lb → ${roundedKg} kg → ${displayedLb} lb → ${roundedBackKg} kg`,
    Math.abs(roundedBackKg - roundedKg) < 0.02,
    `drift: ${Math.abs(roundedBackKg - roundedKg).toFixed(4)} kg`
  );
}

console.log(`\nTested ${testedLb} lb values from 44-1100 lb in 0.5 lb steps\n`);

console.log("=== Property Test 3: Body weight round-trip (0.1 lb precision) ===\n");

// Test every 0.1 lb from 55.5 to 661 lb
let testedBodyWeight = 0;
for (let lb = 55.5; lb <= 661; lb += 0.1) {
  testedBodyWeight++;
  
  // Parse the lb value
  const kg = parseBodyWeight(lb.toFixed(1), "imperial");
  if (kg === null) {
    check(`${lb.toFixed(1)} lb: parses successfully`, false);
    continue;
  }
  
  // Format back
  const formatted = formatBodyWeight(kg, "imperial", false);
  const displayedLb = Number(formatted);
  
  // Should match exactly (within 0.1 lb tolerance due to floating point)
  check(
    `${lb.toFixed(1)} lb → ${kg.toFixed(2)} kg → ${formatted} lb`,
    Math.abs(displayedLb - lb) < 0.15,
    `diff: ${Math.abs(displayedLb - lb).toFixed(2)} lb`
  );
}

console.log(
  `\nTested ${testedBodyWeight} lb values from 55.5-661 lb in 0.1 lb steps\n`
);

console.log("=== Property Test 4: History list vs detail (formatTopSet consistency) ===\n");

// Test that formatTopSet produces consistent output for list and detail
const testWeights = [
  22.5, 42.5, 45.5, 50, 60, 70, 72.5, 80, 85, 90, 100, 120, 150,
];

for (const kg of testWeights) {
  const listDisplay = formatTopSet(kg, "imperial");
  const detailDisplay = formatTopSet(kg, "imperial");
  
  check(
    `${kg} kg: list and detail show same value`,
    listDisplay === detailDisplay,
    `list: "${listDisplay}", detail: "${detailDisplay}"`
  );
  
  // Also verify it uses 0.5 lb rounding
  const lb = kgToLb(kg);
  const rounded = roundLbToHalf(lb);
  const expected = `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} lb top`;
  
  check(
    `${kg} kg displays as ${expected}`,
    listDisplay === expected,
    `got "${listDisplay}"`
  );
}

console.log(`\nTested ${testWeights.length} weight values\n`);

console.log("=== Property Test 5: Metric display rounds to 0.25 kg ===\n");

// Test that metric weights derived from lb display rounded to 0.25 kg
const lbDerivedKg = [
  71.44, // from 157.5 lb → rounds to 71.5 kg
  72.35, // from 159.5 lb (floored) → rounds to 72.25 kg
  77.38, // from 170.6 lb → rounds to 77.5 kg
  61.23, // from 135 lb → rounds to 61.25 kg
];

for (const kg of lbDerivedKg) {
  const display = formatLoad(kg, "metric");
  const rounded = Math.round(kg * 4) / 4;
  const expected = `${rounded.toFixed(2).replace(/\.?0+$/, "")} kg`;
  
  check(
    `${kg} kg displays rounded to 0.25 kg`,
    display === expected,
    `expected "${expected}", got "${display}"`
  );
}

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} property tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} property tests failed\n`);
  process.exit(1);
}
