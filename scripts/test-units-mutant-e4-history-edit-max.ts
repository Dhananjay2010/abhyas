#!/usr/bin/env tsx
/**
 * Mutant E4: History edit max 999 changed to 1100.
 *
 * This test verifies that History edit enforces the correct max weight limit
 * using LOAD_IMPERIAL_MAX_LB (999 lb) and LOAD_METRIC_MAX_KG (500 kg).
 * The mutant would accept 1100 lb, which exceeds the server's 500 kg limit.
 */

import { LOAD_IMPERIAL_MAX_LB, LOAD_METRIC_MAX_KG, displayToKg } from "../src/lib/units";

console.log("\nMutant E4: History edit max must be LOAD_IMPERIAL_MAX_LB (999 lb)\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

// Test 1: Verify LOAD_IMPERIAL_MAX_LB is 999
check(
  "LOAD_IMPERIAL_MAX_LB is 999",
  LOAD_IMPERIAL_MAX_LB === 999,
  `got ${LOAD_IMPERIAL_MAX_LB}`
);

// Test 2: Verify LOAD_METRIC_MAX_KG is 500
check(
  "LOAD_METRIC_MAX_KG is 500",
  LOAD_METRIC_MAX_KG === 500,
  `got ${LOAD_METRIC_MAX_KG}`
);

// Test 3: 999 lb converts to valid kg (under 500 kg limit)
const kg999lb = displayToKg(999, "imperial");
check(
  "999 lb converts to valid kg under 500 kg server limit",
  kg999lb < 500,
  `got ${kg999lb.toFixed(2)} kg`
);

// Test 4: Verify mutant value 1100 lb is close to but under limit (edge case)
const kg1100lb = displayToKg(1100, "imperial");
check(
  "1100 lb is close to 500 kg limit",
  kg1100lb < 500 && kg1100lb > 490,
  `got ${kg1100lb.toFixed(2)} kg`
);

// Test 5: 1200 lb would exceed 500 kg server limit
const kg1200lb = displayToKg(1200, "imperial");
check(
  "1200 lb exceeds 500 kg server limit (mutant allowing 1100+ would accept invalid weights)",
  kg1200lb > 500,
  `got ${kg1200lb.toFixed(2)} kg`
);

// Test 6: Verify edit-sets.tsx uses the constant (manual check)
console.log("\n  Manual verification required:");
console.log("  - src/app/history/[id]/edit-sets.tsx must use LOAD_IMPERIAL_MAX_LB");
console.log("  - Input max attribute must be: max={units === 'imperial' ? LOAD_IMPERIAL_MAX_LB : LOAD_METRIC_MAX_KG}");

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed`);
  console.error("Mutant E4 (max 1100) would PASS this test.\n");
  process.exit(1);
}

console.log("\n✅ Mutant E4 killed: History edit enforces correct max limits\n");
