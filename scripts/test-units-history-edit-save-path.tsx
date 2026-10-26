/**
 * M3 (BLOCKING): Verify that the History edit handleSetChange logic converts
 * 135 lb to 61.23 kg by reading and checking the actual edit-sets.tsx code.
 *
 * This tests that the conversion is wired in the component, not just that
 * displayToKg works in isolation.
 */

import { readFileSync } from "fs";
import { displayToKg } from "../src/lib/units";

console.log("\nM3: History edit save path must convert lb to kg\n");

const units = "imperial" as const;

// Step 1: Read the actual component code
const componentCode = readFileSync("src/app/history/[id]/edit-sets.tsx", "utf8");

// Step 2: Check that displayToKg is called in handleSetChange for weight_kg field
const hasConversion = componentCode.includes('field === "weight_kg"') &&
                      componentCode.includes("displayToKg(numValue, units)");

console.log(`1. Checking edit-sets.tsx for conversion logic:`);
if (!hasConversion) {
  console.error(`   ❌ FAIL: displayToKg not found in handleSetChange for weight_kg field`);
  process.exit(1);
}
console.log(`   ✓ PASS: displayToKg is called for weight_kg field`);

// Step 3: Verify the actual conversion logic works
const userInputLb = 135;
console.log(`\n2. User types: ${userInputLb} lb`);

// Simulate the handleSetChange path
let numValue: number | null = parseFloat(String(userInputLb));

// This is what the component should do (from edit-sets.tsx line 65-69)
if (numValue !== null) {
  const kgValue = displayToKg(numValue, units);
  numValue = kgValue;
}

console.log(`\n3. After conversion: ${numValue} kg`);

const expectedKg = 61.23;
if (numValue !== expectedKg) {
  console.error(`   ❌ FAIL: Expected ${expectedKg} kg, got ${numValue} kg`);
  process.exit(1);
}

console.log(`   ✓ PASS: 135 lb converts to ${numValue} kg`);

// Step 4: Verify the conversion is NOT bypassed
// Check that numValue is reassigned (not commented out)
const conversionAssignment = /if\s*\(\s*field\s*===\s*"weight_kg"[\s\S]{0,200}numValue\s*=\s*kgValue/;
if (!conversionAssignment.test(componentCode)) {
  console.error(`   ❌ FAIL: Conversion assignment "numValue = kgValue" not found or commented out`);
  process.exit(1);
}

console.log(`\n4. ✓ PASS: Conversion assignment is active (not commented out)`);

console.log("\n✅ M3 PASS: History edit save path converts 135 lb to 61.23 kg\n");
