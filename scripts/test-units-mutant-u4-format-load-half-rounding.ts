#!/usr/bin/env tsx
/**
 * Mutant U4: formatLoad with lb half-rounding removed gives '137.8 lb' instead of '138 lb'.
 *
 * This test verifies that formatLoad applies roundLbToHalf for imperial units.
 * The mutant would skip rounding and show raw conversion values.
 */

import { formatLoad, snapPrescribedWeight } from "../src/lib/units";

console.log("\nMutant U4: formatLoad must apply lb half-rounding\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

// Test 1: 62.6 kg converts to 137.96 lb raw, should display as '138 lb' (rounded to 0.5 lb)
const kg626 = 62.6;
const formatted626 = formatLoad(kg626, "imperial");
check(
  "62.6 kg displays as '138 lb' (not '137.8 lb' or '138.0 lb')",
  formatted626 === "138 lb",
  `got "${formatted626}"`
);

// Test 2: 62.5 kg snaps to 62.37 kg, displays as '137.5 lb'
const kg625 = 62.5;
const snapped625 = snapPrescribedWeight(kg625, "imperial");
const formatted625 = formatLoad(snapped625, "imperial");
check(
  "62.5 kg (snapped to 62.37 kg) displays as '137.5 lb'",
  formatted625 === "137.5 lb",
  `got "${formatted625}"`
);

// Test 3: 40 kg converts to 88.18 lb raw, should display as '88 lb'
const kg40 = 40;
const formatted40 = formatLoad(kg40, "imperial");
check(
  "40 kg displays as '88 lb' (not '88.2 lb')",
  formatted40 === "88 lb",
  `got "${formatted40}"`
);

// Test 4: Metric should remain unchanged (identity for display)
const kg60 = 60;
const formattedMetric = formatLoad(kg60, "metric");
check(
  "60 kg (metric) displays as '60 kg'",
  formattedMetric === "60 kg",
  `got "${formattedMetric}"`
);

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed`);
  console.error("Mutant U4 (formatLoad without rounding) would PASS this test.\n");
  process.exit(1);
}

console.log("\n✅ Mutant U4 killed: formatLoad applies lb half-rounding correctly\n");
