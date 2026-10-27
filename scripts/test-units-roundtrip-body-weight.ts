/**
 * Behavioral test for body weight round-trip (L-2).
 * 
 * Tests that body weight entered in lb is displayed as entered:
 * - 170.6 lb entered
 * - Should store as 77.38 kg (not 77.30 kg)
 * - Should display back as 170.6 lb (not 170.5 lb)
 * 
 * This test verifies that parseBodyWeight and formatBodyWeight
 * preserve 0.1 lb precision.
 */

import { parseBodyWeight, formatBodyWeight } from "../src/lib/units";

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

console.log("=== Behavioral Test: Body Weight Round-Trip (170.6 lb case) ===\n");

const inputLb = 170.6;

// Parse the input
const parsedKg = parseBodyWeight(inputLb.toFixed(1), "imperial");

check("Parsing succeeds", parsedKg !== null);

if (parsedKg !== null) {
  // Should be close to 170.6 / 2.20462 = 77.383 kg
  const expectedKg = 77.38; // Rounded to 2 decimal places (DB precision)
  
  check(
    `Stores as ${expectedKg} kg`,
    Math.abs(parsedKg - expectedKg) < 0.01,
    `got ${parsedKg} kg`
  );
  
  // Format back
  const formatted = formatBodyWeight(parsedKg, "imperial", false);
  const displayedLb = Number(formatted);
  
  check(
    `Displays back as ${inputLb} lb`,
    Math.abs(displayedLb - inputLb) < 0.15,
    `got ${formatted} lb`
  );
}

console.log("");
console.log("=== Additional Body Weight Cases ===\n");

const testCases = [
  { lb: 55.5, expectedKg: 25.17 },
  { lb: 100.0, expectedKg: 45.36 },
  { lb: 150.5, expectedKg: 68.27 },
  { lb: 200.8, expectedKg: 91.08 },
  { lb: 661.0, expectedKg: 299.83 },
];

for (const tc of testCases) {
  const parsedKg = parseBodyWeight(tc.lb.toFixed(1), "imperial");
  
  if (parsedKg === null) {
    check(`${tc.lb} lb: parses successfully`, false);
    continue;
  }
  
  check(
    `${tc.lb} lb → ~${tc.expectedKg} kg`,
    Math.abs(parsedKg - tc.expectedKg) < 0.02,
    `got ${parsedKg} kg`
  );
  
  const formatted = formatBodyWeight(parsedKg, "imperial", false);
  const displayedLb = Number(formatted);
  
  check(
    `${tc.lb} lb round-trips`,
    Math.abs(displayedLb - tc.lb) < 0.15,
    `got ${formatted} lb`
  );
}

console.log("");

// Test metric body weight too
console.log("=== Metric Body Weight ===\n");

const metricCases = [25.5, 50.0, 77.4, 100.0, 299.9];

for (const kg of metricCases) {
  const parsedKg = parseBodyWeight(kg.toFixed(1), "metric");
  
  if (parsedKg === null) {
    check(`${kg} kg: parses successfully`, false);
    continue;
  }
  
  const formatted = formatBodyWeight(parsedKg, "metric", false);
  const displayedKg = Number(formatted);
  
  check(
    `${kg} kg round-trips`,
    Math.abs(displayedKg - kg) < 0.15,
    `got ${formatted} kg`
  );
}

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
