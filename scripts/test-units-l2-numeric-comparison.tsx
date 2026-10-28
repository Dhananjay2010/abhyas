#!/usr/bin/env tsx
/**
 * L2: Unedited check compares numerically, not as text.
 * 
 * Tests that typing 187.0 over a displayed 187 still counts as unedited
 * and saves the exact original 85 kg.
 */

import { weightKgToSubmit } from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== L2: Numeric comparison for unedited check ===\n");

// Test case 1: 187.0 typed over 187 is still unedited
const defaultKg1 = 85;
const initialPrefill1 = "187";
const typedWeight1 = "187.0";

const submitted1 = weightKgToSubmit(typedWeight1, initialPrefill1, defaultKg1, "imperial");
check("187.0 typed over 187 is numerically equal", Number(typedWeight1) === Number(initialPrefill1));
check("Submits exact original 85 kg", submitted1 === 85, `got ${submitted1}`);

// Test case 2: 187.00 typed over 187 is still unedited
const typedWeight2 = "187.00";
const submitted2 = weightKgToSubmit(typedWeight2, initialPrefill1, defaultKg1, "imperial");
check("187.00 typed over 187 is numerically equal", Number(typedWeight2) === Number(initialPrefill1));
check("Submits exact original 85 kg", submitted2 === 85, `got ${submitted2}`);

// Test case 3: 160.0 typed over 160 for 72.5 kg
const defaultKg3 = 72.5;
const initialPrefill3 = "160";
const typedWeight3 = "160.0";

const submitted3 = weightKgToSubmit(typedWeight3, initialPrefill3, defaultKg3, "imperial");
check("160.0 typed over 160 is numerically equal", Number(typedWeight3) === Number(initialPrefill3));
check("Submits exact original 72.5 kg", submitted3 === 72.5, `got ${submitted3}`);

// Test case 4: Edited weight (188 typed over 187) converts normally
const typedWeight4 = "188";
const submitted4 = weightKgToSubmit(typedWeight4, initialPrefill1, defaultKg1, "imperial");
check("188 typed over 187 is edited", Number(typedWeight4) !== Number(initialPrefill1));
check("Submits converted value ~85.28 kg", submitted4 !== null && Math.abs(submitted4 - 85.28) < 0.1, 
  `got ${submitted4}`);

// Test case 5: Metric - 72.5 typed over 72.5 is unedited
const defaultKg5 = 72.5;
const initialPrefill5 = "72.5";
const typedWeight5 = "72.5";

const submitted5 = weightKgToSubmit(typedWeight5, initialPrefill5, defaultKg5, "metric");
check("Metric 72.5 typed over 72.5 is equal", Number(typedWeight5) === Number(initialPrefill5));
check("Submits exact original 72.5 kg", submitted5 === 72.5, `got ${submitted5}`);

if (failures === 0) {
  console.log(`\n✓ All L2 tests passed\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
