#!/usr/bin/env tsx
/**
 * Test body weight validation in logBodyWeight.
 * 
 * Must import real code (no duplicated logic).
 */

import { validateWeightKg } from "../src/lib/profile/validation";

console.log("\nBody Weight Validation Tests\n");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// 1. Valid weights
// ============================================================
console.log("1. Valid weights");
{
  check("accepts 25 kg (lower bound)", validateWeightKg(25).ok);
  check("accepts 70 kg (typical)", validateWeightKg(70).ok);
  check("accepts 300 kg (upper bound)", validateWeightKg(300).ok);
  check("accepts weight as string", validateWeightKg("70").ok);
}

// ============================================================
// 2. Invalid weights
// ============================================================
console.log("\n2. Invalid weights");
{
  check("rejects negative weight (-5)", !validateWeightKg(-5).ok);
  check("rejects zero weight", !validateWeightKg(0).ok);
  check("rejects below minimum (24)", !validateWeightKg(24).ok);
  check("rejects above maximum (301)", !validateWeightKg(301).ok);
}

// ============================================================
// 3. P3-M5: NaN and Infinity
// ============================================================
console.log("\n3. P3-M5: NaN and Infinity");
{
  check("rejects NaN", !validateWeightKg(NaN).ok);
  check("rejects Infinity", !validateWeightKg(Infinity).ok);
  check("rejects -Infinity", !validateWeightKg(-Infinity).ok);
  check('rejects "NaN" string', !validateWeightKg("NaN").ok);
  check('rejects "invalid" string', !validateWeightKg("invalid").ok);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
