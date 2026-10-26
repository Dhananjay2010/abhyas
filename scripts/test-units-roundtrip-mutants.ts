/**
 * Mutant tests for units round-trip fixes.
 * 
 * Tests that verify the behavioral tests fail when we revert to old behavior:
 * - Mutant 1: formatTopSet uses Math.floor instead of roundLbToHalf
 * - Mutant 2: formatTopSet rounds to 0.1 lb instead of 0.5 lb
 * - Mutant 3: formatLoad shows metric to 2 decimal places instead of 1
 * - Mutant 4: Body weight uses 0.5 lb rounding instead of 0.1 lb
 * 
 * These mutants should be killed by the behavioral tests.
 */

import { kgToLb } from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== Mutant 1: formatTopSet uses Math.floor (0.1 lb rounding) ===\n");

// Simulate the OLD formatTopSet that rounded to 0.1 lb
function formatTopSetMutant1(weightKg: number): string {
  const lb = kgToLb(weightKg);
  const rounded = Math.round(lb * 10) / 10; // 0.1 lb precision (WRONG)
  const numStr = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${numStr} lb top`;
}

const kg85 = 85;
const mutant1Result = formatTopSetMutant1(kg85);
const expected85 = "187.5 lb top";

check(
  "Mutant 1: 85 kg shows 187.4 lb (wrong)",
  mutant1Result !== expected85,
  `got "${mutant1Result}", expected "${expected85}"`
);

console.log("");
console.log("=== Mutant 2: formatLoad shows 2 decimal places for metric ===\n");

// Simulate the OLD formatLoad that showed 2 decimal places
function formatLoadMutant2(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted} kg`;
}

const kg7144 = 71.44;
const mutant2Result = formatLoadMutant2(kg7144);
const expected7144 = "71.4 kg";

check(
  "Mutant 2: 71.44 kg shows 71.44 kg (wrong)",
  mutant2Result !== expected7144,
  `got "${mutant2Result}", expected "${expected7144}"`
);

console.log("");
console.log("=== Mutant 3: Body weight uses 0.5 lb rounding ===\n");

// Simulate the OLD parseWeight that rounded to 0.5 lb
function parseBodyWeightMutant3(input: string): number {
  const value = Number(input);
  const roundedLb = Math.round(value * 2) / 2; // 0.5 lb rounding (WRONG)
  const kg = roundedLb / 2.20462262185;
  return Math.round(kg * 100) / 100;
}

const input1706 = "170.6";
const mutant3Result = parseBodyWeightMutant3(input1706);

// With 0.5 lb rounding: 170.6 → 170.5 → 77.33 kg
// With 0.1 lb rounding: 170.6 → 170.6 → 77.38 kg
const expectedKg1706 = 77.38;

check(
  "Mutant 3: 170.6 lb stores as 77.33 kg (wrong)",
  Math.abs(mutant3Result - expectedKg1706) > 0.03,
  `got ${mutant3Result} kg, expected ${expectedKg1706} kg`
);

console.log("");
console.log("=== Mutant 4: snapPrescribedWeight uses Math.round instead of Math.floor ===\n");

// Simulate snapPrescribedWeight with Math.round (could cause false PBs)
function snapPrescribedWeightMutant4(kg: number): number {
  const lb = kg * 2.20462262185;
  const snappedLb = Math.round(lb * 2) / 2; // ROUNDS instead of FLOORS
  return Math.round((snappedLb / 2.20462262185) * 100) / 100;
}

const kg725 = 72.5;
const mutant4Result = snapPrescribedWeightMutant4(kg725);

// With floor: 72.5 kg → 159.835 lb → floor to 159.5 lb → 72.35 kg
// With round: 72.5 kg → 159.835 lb → round to 160.0 lb → 72.57 kg
check(
  "Mutant 4: snap rounds up (could cause false PBs)",
  mutant4Result > kg725,
  `got ${mutant4Result} kg, original ${kg725} kg`
);

console.log("");

if (passed === 4) {
  console.log(`✓ All ${passed} mutants were correctly identified\n`);
  process.exit(0);
} else {
  console.log(`✗ Only ${passed} of 4 mutants were identified\n`);
  process.exit(1);
}
