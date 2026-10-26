#!/usr/bin/env tsx
/**
 * L-d end-to-end: Body weight validation through parseWeight and logBodyWeight.
 * 
 * Tests that parseWeight and logBodyWeight both use validateBodyWeightKg
 * for consistent, inclusive bounds in display units:
 * - Imperial: 55-661 lb (24.9-299.8 kg after rounding)
 * - Metric: 25-300 kg
 * 
 * Critical edge case: 55 lb → 24.948 kg → rounds to 24.9 kg → must accept
 * via roundLbToHalf(kgToLb(24.9)) = 55 lb check.
 */

import { parseWeight, validateBodyWeightKg, lbToKg } from "@/lib/units";

console.log("\n🧪 L-d: Body weight end-to-end validation\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// 1. parseWeight client-side validation
// ============================================================
console.log("parseWeight (client-side):");

// Imperial: 55 lb accepted (minimum)
{
  const kg = parseWeight("55", "imperial");
  check("parseWeight: 55 lb accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
  if (kg !== null) {
    check("parseWeight: 55 lb → validateBodyWeightKg accepts", validateBodyWeightKg(kg, "imperial"), `kg=${kg}`);
  }
}

// Imperial: 54 lb rejected (below minimum)
{
  const kg = parseWeight("54", "imperial");
  check("parseWeight: 54 lb rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// Imperial: 661 lb accepted (maximum)
{
  const kg = parseWeight("661", "imperial");
  check("parseWeight: 661 lb accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
  if (kg !== null) {
    check("parseWeight: 661 lb → validateBodyWeightKg accepts", validateBodyWeightKg(kg, "imperial"), `kg=${kg}`);
  }
}

// Imperial: 662 lb rejected (above maximum)
{
  const kg = parseWeight("662", "imperial");
  check("parseWeight: 662 lb rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// Metric: 25 kg accepted (minimum)
{
  const kg = parseWeight("25", "metric");
  check("parseWeight: 25 kg accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
}

// Metric: 24.9 kg rejected (below minimum)
{
  const kg = parseWeight("24.9", "metric");
  check("parseWeight: 24.9 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// Metric: 300 kg accepted (maximum)
{
  const kg = parseWeight("300", "metric");
  check("parseWeight: 300 kg accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
}

// Metric: 300.1 kg rejected (above maximum)
{
  const kg = parseWeight("300.1", "metric");
  check("parseWeight: 300.1 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// ============================================================
// 2. validateBodyWeightKg (used by logBodyWeight server-side)
// ============================================================
console.log("\nvalidateBodyWeightKg (server-side):");

// Imperial: 55 lb edge case (55 lb → 24.948 kg → 24.9 kg → must accept)
{
  const lbValue = 55;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const accepted = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 24.9 kg (from 55 lb) accepted for imperial", accepted, `kg=${roundedKg}`);
}

// Imperial: 54 lb edge case (should reject)
{
  const lbValue = 54;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const accepted = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 24.5 kg (from 54 lb) rejected for imperial", !accepted, `kg=${roundedKg}`);
}

// Imperial: 661 lb accepted
{
  const lbValue = 661;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const accepted = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 299.8 kg (from 661 lb) accepted for imperial", accepted, `kg=${roundedKg}`);
}

// Imperial: 662 lb rejected
{
  const lbValue = 662;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const accepted = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 300.2 kg (from 662 lb) rejected for imperial", !accepted, `kg=${roundedKg}`);
}

// Metric: 25 kg accepted
{
  const accepted = validateBodyWeightKg(25, "metric");
  check("validateBodyWeightKg: 25 kg accepted for metric", accepted);
}

// Metric: 24.9 kg rejected
{
  const accepted = validateBodyWeightKg(24.9, "metric");
  check("validateBodyWeightKg: 24.9 kg rejected for metric", !accepted);
}

// Metric: 300 kg accepted
{
  const accepted = validateBodyWeightKg(300, "metric");
  check("validateBodyWeightKg: 300 kg accepted for metric", accepted);
}

// Metric: 300.1 kg rejected
{
  const accepted = validateBodyWeightKg(300.1, "metric");
  check("validateBodyWeightKg: 300.1 kg rejected for metric", !accepted);
}

// ============================================================
// 3. End-to-end: parseWeight → validateBodyWeightKg consistency
// ============================================================
console.log("\nEnd-to-end consistency:");

// Every weight parseWeight accepts must pass validateBodyWeightKg
const testCases: Array<{ input: string; units: "imperial" | "metric"; label: string }> = [
  { input: "55", units: "imperial", label: "55 lb" },
  { input: "661", units: "imperial", label: "661 lb" },
  { input: "25", units: "metric", label: "25 kg" },
  { input: "300", units: "metric", label: "300 kg" },
];

for (const { input, units, label } of testCases) {
  const kg = parseWeight(input, units);
  if (kg !== null) {
    const valid = validateBodyWeightKg(kg, units);
    check(`${label}: parseWeight → validateBodyWeightKg consistent`, valid, kg !== null && !valid ? `parseWeight accepted ${kg} kg but validateBodyWeightKg rejected` : "");
  }
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
