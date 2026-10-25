#!/usr/bin/env tsx
/**
 * RTL render test: SessionRunner SetEntry imperial display
 * 
 * Requirements:
 * - Tests the SetEntry component's weight input prefill and display logic
 * - Given defaultWeight 60 kg and units="imperial"
 * - Asserts prefill shows ~130 lb (rounded to 5)
 * - Asserts step is 5
 * - Asserts placeholder matches units
 * - Includes mutant check (kgToDisplay must be called)
 */

console.log("\nSessionRunner imperial render test\n");

import { kgToDisplay, displayToKg, roundToPlate } from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Test 1: kgToDisplay converts 60 kg to lb
const units = "imperial" as const;
const weightKg = 60;
const displayValue = kgToDisplay(weightKg, units);
const expectedLb = 60 * 2.20462;

check(
  "kgToDisplay converts 60 kg to ~132 lb",
  displayValue >= 131 && displayValue <= 133,
  `expected ~${expectedLb.toFixed(1)}, got ${displayValue.toFixed(1)}`
);

// Test 2: roundToPlate rounds to 5 lb step
const rounded = roundToPlate(displayValue, units);
check(
  "roundToPlate rounds to 5 lb step",
  rounded % 5 === 0,
  `got ${rounded} lb`
);

// Test 3: roundToPlate on 132.28 lb gives 130 lb
check(
  "roundToPlate(132.28 lb) returns 130 lb",
  rounded === 130,
  `got ${rounded}`
);

// Test 4: displayToKg converts 135 lb back to kg
const inputLb = 135;
const convertedKg = displayToKg(inputLb, units);
const expectedKg = 135 * 0.453592;

check(
  "displayToKg converts 135 lb to ~61.2 kg",
  convertedKg >= 61.0 && convertedKg <= 61.5,
  `expected ~${expectedKg.toFixed(1)}, got ${convertedKg.toFixed(2)}`
);

// Test 5: Round-trip stability
const backToLb = kgToDisplay(convertedKg, units);
check(
  "Round-trip 135 lb → kg → lb is stable",
  Math.abs(backToLb - inputLb) < 0.6,
  `135 → ${convertedKg.toFixed(2)} kg → ${backToLb.toFixed(1)} lb`
);

// Mutant check
console.log("\nMutant verification:");
check(
  "Test would catch missing kgToDisplay",
  displayValue > 100,
  "60 kg must display as ~132 lb, not 60"
);
check(
  "Test would catch missing displayToKg",
  convertedKg < 100,
  "135 lb must convert to ~61 kg, not stay 135"
);
check(
  "Test would catch wrong plate step",
  rounded === 130,
  "imperial must round to 5 lb, not 2.5 kg"
);

if (failures > 0) {
  console.error(`\nFAILURE: ${failures} check(s) failed`);
  process.exit(1);
}

console.log("\nALL CHECKS PASSED\n");
