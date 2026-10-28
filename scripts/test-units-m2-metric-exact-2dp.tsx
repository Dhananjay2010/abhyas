#!/usr/bin/env tsx
/**
 * M2/L3: Metric displays EXACT value to 2dp with trailing zeros trimmed, NO 0.25 grid.
 * 
 * Tests that 77.38 kg displays as 77.38, not 77.40, and re-saving doesn't round it.
 */

import { formatLoad, formatWeight, formatTopSet, computeRunnerWeightPrefill } from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== M2/L3: Metric displays exact 2dp, no 0.25 grid ===\n");

// Test case 1: 77.38 kg displays as 77.38, not 77.40 (0.25 grid) or 77.4 (0.1 grid)
const kg1 = 77.38;
const formatted1 = formatWeight(kg1, "metric");
check("formatWeight shows 77.38 kg (exact, not 77.4)", formatted1 === "77.38 kg", `got "${formatted1}"`);

const load1 = formatLoad(kg1, "metric");
check("formatLoad shows 77.38 kg (exact)", load1 === "77.38 kg", `got "${load1}"`);

const topSet1 = formatTopSet(kg1, "metric");
check("formatTopSet shows 77.38 kg top (exact)", topSet1 === "77.38 kg top", `got "${topSet1}"`);

const prefill1 = computeRunnerWeightPrefill(kg1, "metric", false, false);
check("Prefill shows 77.38 (exact)", prefill1 === "77.38", `got "${prefill1}"`);

console.log("");

// Test case 2: 16.25 kg displays as 16.25, not 16.3
const kg2 = 16.25;
const formatted2 = formatWeight(kg2, "metric");
check("formatWeight shows 16.25 kg", formatted2 === "16.25 kg", `got "${formatted2}"`);

const load2 = formatLoad(kg2, "metric");
check("formatLoad shows 16.25 kg", load2 === "16.25 kg", `got "${load2}"`);

console.log("");

// Test case 3: 52.5 kg displays as 52.5, not 52.50
const kg3 = 52.5;
const formatted3 = formatWeight(kg3, "metric");
check("formatWeight shows 52.5 kg (trailing zeros trimmed)", formatted3 === "52.5 kg", `got "${formatted3}"`);

const load3 = formatLoad(kg3, "metric");
check("formatLoad shows 52.5 kg", load3 === "52.5 kg", `got "${load3}"`);

console.log("");

// Test case 4: 40 kg displays as 40, not 40.00
const kg4 = 40;
const formatted4 = formatWeight(kg4, "metric");
check("formatWeight shows 40 kg (no decimals)", formatted4 === "40 kg", `got "${formatted4}"`);

const load4 = formatLoad(kg4, "metric");
check("formatLoad shows 40 kg", load4 === "40 kg", `got "${load4}"`);

const prefill4 = computeRunnerWeightPrefill(kg4, "metric", false, false);
check("Prefill shows 40 (no decimals)", prefill4 === "40", `got "${prefill4}"`);

console.log("");

// Test case 5: Trailing zeros trimmed: 77.40 -> 77.4
const kg5 = 77.40;
const formatted5 = formatWeight(kg5, "metric");
check("formatWeight shows 77.4 kg (trailing zero trimmed)", formatted5 === "77.4 kg", `got "${formatted5}"`);

console.log("");

// Test case 6: Off-grid values stay exact: 71.44 kg, 35.15 kg, 62.37 kg
const offGrid = [
  { kg: 71.44, expected: "71.44 kg" },
  { kg: 35.15, expected: "35.15 kg" },
  { kg: 62.37, expected: "62.37 kg" },
];

for (const { kg, expected } of offGrid) {
  const formatted = formatWeight(kg, "metric");
  check(`${kg} kg displays as ${expected} (exact)`, formatted === expected, `got "${formatted}"`);
}

if (failures === 0) {
  console.log(`\n✓ All M2/L3 tests passed\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
