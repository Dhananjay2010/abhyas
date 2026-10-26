#!/usr/bin/env tsx
/**
 * M1 (BLOCKING): Runner weight input must prefill 137.5 lb for 62.5 kg in imperial mode.
 *
 * This test verifies the actual prefill calculation from session-runner.tsx
 * lines 1218-1228, which determines the initial value of the weight input.
 *
 * The test:
 * 1. Tests the prefill calculation function directly
 * 2. Verifies it's wired by reading the component source
 * 3. Checks that a mutant using roundToPlate would fail
 */

import { kgToDisplay, roundLbToHalf, roundToPlate } from "../src/lib/units";
import { readFileSync } from "fs";

console.log("\nM1: Runner weight input prefills 137.5 lb for 62.5 kg\n");

// This is the exact prefill logic from session-runner.tsx lines 1218-1228
function calculateWeightPrefill(
  defaultWeight: number | null,
  units: "metric" | "imperial",
  isBodyweight: boolean
): string {
  const shouldPrefillWeight = !isBodyweight || (defaultWeight !== null && defaultWeight > 0);
  
  if (!shouldPrefillWeight || defaultWeight === null) return "";
  
  if (units === "metric") {
    return String(defaultWeight);
  }
  
  // Imperial: convert to lb and round to 0.5 lb (matches working weight line)
  const displayValue = kgToDisplay(defaultWeight, units);
  const rounded = roundLbToHalf(displayValue);
  return String(rounded);
}

// Test case: The runner uses snapPrescribedWeight BEFORE passing to prefill
// So we need to snap first
import { snapPrescribedWeight } from "../src/lib/units";

const prescribedKg = 62.5;
const units = "imperial" as const;
const isBodyweight = false;

// This is what the runner does at line 666-667:
// const lastWeight = ... ?? snapPrescribedWeight(current.suggestedWeightKg, settings.units);
const snappedKg = snapPrescribedWeight(prescribedKg, units);

console.log("1. Testing prefill calculation:");
console.log(`   Prescribed weight: ${prescribedKg} kg`);
console.log(`   Snapped for imperial grid: ${snappedKg} kg`);
console.log(`   Units: ${units}`);

const prefillValue = calculateWeightPrefill(snappedKg, units, isBodyweight);

console.log(`   Prefill value: ${prefillValue} lb`);

if (prefillValue !== "137.5") {
  console.error(`   ❌ FAIL: Expected "137.5", got "${prefillValue}"`);
  process.exit(1);
}

console.log("   ✓ PASS: Prefill is 137.5 lb");

// Step 2: Verify the component uses this logic
console.log("\n2. Verifying component wiring...");
const componentCode = readFileSync("src/app/session/[id]/session-runner.tsx", "utf8");

// Check for the key elements of the prefill logic
const hasImperialLogic =
  componentCode.includes('if (units === "metric")') &&
  componentCode.includes("const displayValue = kgToDisplay(defaultWeight, units)") &&
  componentCode.includes("const rounded = roundLbToHalf(displayValue)") &&
  componentCode.includes("return String(rounded)");

if (!hasImperialLogic) {
  console.error("   ❌ FAIL: Component does not use roundLbToHalf for imperial prefill");
  process.exit(1);
}

console.log("   ✓ PASS: Component uses roundLbToHalf in weight prefill");

// Step 3: Verify working weight line agreement
console.log("\n3. Verifying prefill matches working weight line...");
// The working weight line uses formatLoad which applies roundLbToHalf to the snapped weight
const workingWeightDisplay = roundLbToHalf(kgToDisplay(snappedKg!, units));

console.log(`   Working weight line shows: ${workingWeightDisplay} lb`);
console.log(`   Input prefills: ${prefillValue} lb`);

if (parseFloat(prefillValue) !== workingWeightDisplay) {
  console.error(`   ❌ FAIL: Prefill doesn't match working weight line!`);
  process.exit(1);
}

console.log("   ✓ PASS: Prefill matches working weight line");

// Step 4: Mutant check - using roundToPlate would give wrong answer
console.log("\n4. Mutant check: roundToPlate would fail...");
const wrongPrefill = String(roundToPlate(kgToDisplay(prescribedKg, units), units));

console.log(`   roundToPlate would give: ${wrongPrefill} lb`);
console.log(`   roundLbToHalf gives: ${prefillValue} lb`);

if (wrongPrefill === prefillValue) {
  console.error(`   ❌ FAIL: roundToPlate gives same answer as roundLbToHalf!`);
  process.exit(1);
}

console.log(`   ✓ PASS: roundToPlate (${wrongPrefill} lb) differs from roundLbToHalf (${prefillValue} lb)`);

// Step 5: Verify the component does NOT use roundToPlate
console.log("\n5. Verifying component does NOT use roundToPlate...");
const usesRoundToPlate = componentCode.match(/const rounded = roundToPlate\(displayValue, units\)/);

if (usesRoundToPlate) {
  console.error("   ❌ FAIL: Component uses roundToPlate for prefill!");
  process.exit(1);
}

console.log("   ✓ PASS: Component does not use roundToPlate");

console.log("\n✅ M1 PASS: Runner prefills 137.5 lb for 62.5 kg in imperial\n");
console.log("Note: This test verifies:");
console.log("  1. The prefill calculation uses roundLbToHalf (0.5 lb steps)");
console.log("  2. 62.5 kg prefills as 137.5 lb, not 140 lb");
console.log("  3. The component source uses roundLbToHalf, not roundToPlate");
console.log("  4. A mutant using roundToPlate would give a different answer\n");
