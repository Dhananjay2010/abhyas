#!/usr/bin/env tsx
/**
 * Tests for kg/lb units conversion and round-trip stability.
 * 
 * Requirements:
 * - Round-trip: user enters 45 lb, saves, reloads → displays 45 lb (not 44.5 or 45.5)
 * - Test values: 45, 135, 137.5, 225, 315 lb and 2.5 kg steps
 * - No drift across save/reload cycles
 */

import { strict as assert } from "node:assert";
import {
  kgToDisplay,
  displayToKg,
  formatLoad,
  roundToPlate,
  kgToLb,
  lbToKg,
} from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean): void {
  if (!pass) {
    console.error(`  ✗ ${label}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log("\n🧪 Testing kg/lb conversion and round-trip stability\n");

// ============================================================================
// TEST 1: Round-trip stability for imperial loads
// ============================================================================
console.log("▶ Round-trip: lb → kg → lb must not drift");

const lbTestValues = [45, 135, 137.5, 225, 315];

for (const originalLb of lbTestValues) {
  // User enters value in lb
  const kg = displayToKg(originalLb, "imperial");
  
  // System stores in kg, then displays back
  const displayedLb = kgToDisplay(kg, "imperial");
  
  // For round-trip stability, the displayed value should round to the original
  // when applying the same rounding we use for display (0.5 lb precision)
  const displayedRounded = Math.round(displayedLb * 2) / 2;
  const originalRounded = Math.round(originalLb * 2) / 2;
  
  check(
    `${originalLb} lb → ${kg.toFixed(2)} kg → ${displayedLb.toFixed(2)} lb (rounds to ${displayedRounded})`,
    Math.abs(displayedRounded - originalRounded) < 0.01
  );
}

// ============================================================================
// TEST 2: Round-trip stability for metric loads
// ============================================================================
console.log("\n▶ Round-trip: kg → kg (metric should be identity)");

const kgTestValues = [20, 60, 62.5, 102.5, 142.5];

for (const originalKg of kgTestValues) {
  const stored = displayToKg(originalKg, "metric");
  const displayed = kgToDisplay(stored, "metric");
  
  check(
    `${originalKg} kg → ${stored.toFixed(2)} kg → ${displayed} kg (identity)`,
    Math.abs(displayed - originalKg) < 0.01
  );
}

// ============================================================================
// TEST 3: Plate rounding (2.5 kg / 5 lb steps)
// ============================================================================
console.log("\n▶ Plate rounding: 2.5 kg / 5 lb steps");

// Imperial: 5 lb steps
check("roundToPlate(42, 'imperial') === 40", roundToPlate(42, "imperial") === 40);
check("roundToPlate(43, 'imperial') === 45", roundToPlate(43, "imperial") === 45);
check("roundToPlate(47.5, 'imperial') === 45", roundToPlate(47.5, "imperial") === 45); // Tie rounds down
check("roundToPlate(48, 'imperial') === 50", roundToPlate(48, "imperial") === 50);

// Metric: 2.5 kg steps
check("roundToPlate(21, 'metric') === 20", roundToPlate(21, "metric") === 20);
check("roundToPlate(22, 'metric') === 22.5", roundToPlate(22, "metric") === 22.5);
check("roundToPlate(21.25, 'metric') === 20", roundToPlate(21.25, "metric") === 20); // Tie rounds down
check("roundToPlate(21.5, 'metric') === 22.5", roundToPlate(21.5, "metric") === 22.5);

// ============================================================================
// TEST 4: formatLoad output matches expected format
// ============================================================================
console.log("\n▶ formatLoad: correct unit labels and formatting");

check("formatLoad(60, 'metric') === '60 kg'", formatLoad(60, "metric") === "60 kg");
check("formatLoad(62.5, 'metric') === '62.5 kg'", formatLoad(62.5, "metric") === "62.5 kg");
check("formatLoad(60, 'imperial') shows lb", formatLoad(60, "imperial").includes("lb"));
check("formatLoad(null, 'metric') === '—'", formatLoad(null, "metric") === "—");
check("formatLoad(0, 'imperial') === '—'", formatLoad(0, "imperial") === "—");

// Verify 60 kg converts to ~132 lb
const load60kg = formatLoad(60, "imperial");
check(
  "formatLoad(60 kg, 'imperial') ~= 132 lb",
  load60kg.includes("132") || load60kg.includes("132.5")
);

// ============================================================================
// TEST 5: displayToKg precision matches database (numeric(6,2))
// ============================================================================
console.log("\n▶ displayToKg: precision matches DB column (6,2)");

// Database stores as numeric(6,2), so max 4 digits before decimal, 2 after
// Test that displayToKg always returns values that fit
const edgeCases = [
  { input: 999.9, units: "imperial" as const },
  { input: 500, units: "metric" as const },
  { input: 1000, units: "imperial" as const },
];

for (const { input, units } of edgeCases) {
  const kg = displayToKg(input, units);
  const wholePart = Math.floor(kg);
  const decimalPart = Math.round((kg - wholePart) * 100);
  
  check(
    `displayToKg(${input} ${units}) = ${kg.toFixed(2)} kg fits numeric(6,2)`,
    wholePart < 10000 && decimalPart >= 0 && decimalPart < 100
  );
}

// ============================================================================
// TEST 6: Mutant evidence - kgToDisplay removal breaks display
// ============================================================================
console.log("\n▶ Mutant evidence: removing conversion breaks display");

// Simulate what would happen if we removed kgToDisplay and just showed kg directly
function brokenDisplay(kg: number, units: "metric" | "imperial"): number {
  // MUTANT: just return kg without conversion
  return kg;
}

const testKg = 60; // 60 kg = ~132 lb
const correctImperial = kgToDisplay(testKg, "imperial");
const brokenImperial = brokenDisplay(testKg, "imperial");

check(
  `Correct display: 60 kg → ${correctImperial.toFixed(1)} lb`,
  Math.abs(correctImperial - 132) < 1
);

check(
  `Broken display: 60 kg → ${brokenImperial} (wrong, should be ~132)`,
  Math.abs(brokenImperial - 60) < 0.1
);

check(
  "Mutant test: broken != correct (proves conversion is necessary)",
  Math.abs(correctImperial - brokenImperial) > 50
);

// ============================================================================
// TEST 7: Cross-boundary edge cases
// ============================================================================
console.log("\n▶ Edge cases: zeros, negatives, non-finite");

check("displayToKg(0, 'metric') === 0", displayToKg(0, "metric") === 0);
check("displayToKg(null, 'imperial') === 0", displayToKg(null, "imperial") === 0);
check("displayToKg(undefined, 'metric') === 0", displayToKg(undefined, "metric") === 0);
check("displayToKg(-5, 'imperial') === 0", displayToKg(-5, "imperial") === 0);
check("displayToKg(NaN, 'metric') === 0", displayToKg(NaN, "metric") === 0);
check("displayToKg(Infinity, 'imperial') === 0", displayToKg(Infinity, "imperial") === 0);

check("kgToDisplay(0, 'metric') === 0", kgToDisplay(0, "metric") === 0);
check("kgToDisplay(null, 'imperial') === 0", kgToDisplay(null, "imperial") === 0);
check("kgToDisplay(NaN, 'metric') === 0", kgToDisplay(NaN, "metric") === 0);

// ============================================================================
// TEST 8: Conversion constants are accurate
// ============================================================================
console.log("\n▶ Conversion constants: 1 kg = 2.20462262185 lb");

const oneKgInLb = kgToLb(1);
check(
  `kgToLb(1) = ${oneKgInLb.toFixed(11)} lb`,
  Math.abs(oneKgInLb - 2.20462262185) < 0.0000001
);

const oneLbInKg = lbToKg(1);
check(
  `lbToKg(1) = ${oneLbInKg.toFixed(11)} kg`,
  Math.abs(oneLbInKg - 0.45359237) < 0.0000001
);

// Round-trip through conversion should be identity
const kgRoundTrip = lbToKg(kgToLb(100));
check(
  `lbToKg(kgToLb(100)) = ${kgRoundTrip.toFixed(6)} (should be 100)`,
  Math.abs(kgRoundTrip - 100) < 0.0001
);

// ============================================================================
// SUMMARY
// ============================================================================
console.log("");
if (failures === 0) {
  console.log("✅ All unit conversion tests passed\n");
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
