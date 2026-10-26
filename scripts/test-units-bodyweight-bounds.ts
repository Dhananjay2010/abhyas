/**
 * L-d: Body-weight limits must be inclusive in display units.
 * 
 * Tests parseWeight end-to-end, which uses validateBodyWeightKg internally.
 * 
 * Imperial: 56 lb and 661 lb accepted, 55.5 and 661.5 rejected
 * Metric: 25 kg and 300 kg accepted, 24.9 and 300.1 rejected
 * 
 * Note: Imperial floor is 56 lb (25.4 kg) to satisfy DB constraint weight_kg >= 25
 */

import { parseWeight, lbToKg, kgToLb, validateBodyWeightKg } from "@/lib/units";

console.log("\n🧪 L-d: Body-weight limits inclusive in display units\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// 1. Imperial bounds
// ============================================================

// 56 lb should be accepted (minimum)
{
  const kg = parseWeight(56, "imperial");
  check("Imperial 56 lb accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
  if (kg !== null) {
    const display = kgToLb(kg);
    check("Imperial 56 lb round-trips correctly", display >= 55.5 && display <= 56.5);
  }
}

// 55.5 lb should be rejected (below minimum)
{
  const kg = parseWeight(55.5, "imperial");
  check("Imperial 55.5 lb rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// 661 lb should be accepted (maximum)
{
  const kg = parseWeight(661, "imperial");
  check("Imperial 661 lb accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
  if (kg !== null) {
    const display = kgToLb(kg);
    check("Imperial 661 lb round-trips correctly", display >= 660.5 && display <= 661.5);
  }
}

// 661.5 lb should be rejected (above maximum)
{
  const kg = parseWeight(661.5, "imperial");
  check("Imperial 661.5 lb rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// ============================================================
// 2. Metric bounds
// ============================================================

// 25 kg should be accepted (minimum)
{
  const kg = parseWeight(25, "metric");
  check("Metric 25 kg accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
}

// 24.5 kg should be rejected (below minimum)
{
  const kg = parseWeight(24.5, "metric");
  check("Metric 24.5 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// 24.9 kg should be rejected (below minimum, rounds to 24.9 from 55 lb boundary)
{
  const kg = parseWeight(24.9, "metric");
  check("Metric 24.9 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// 300 kg should be accepted (maximum)
{
  const kg = parseWeight(300, "metric");
  check("Metric 300 kg accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
}

// 300.5 kg should be rejected (above maximum)
{
  const kg = parseWeight(300.5, "metric");
  check("Metric 300.5 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// 300.1 kg should be rejected (above maximum)
{
  const kg = parseWeight(300.1, "metric");
  check("Metric 300.1 kg rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
}

// ============================================================
// 3. Test validateBodyWeightKg directly (used by logBodyWeight)
// ============================================================

// Imperial: 56 lb edge case (56 lb → 25.401 kg → rounds to 25.4 kg → must accept)
{
  const lbValue = 56;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const valid = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 25.4 kg (from 56 lb) accepted for imperial", valid, `kg=${roundedKg}`);
}

// Imperial: 661 lb edge case
{
  const lbValue = 661;
  const kgFromLb = lbToKg(lbValue);
  const roundedKg = Math.round(kgFromLb * 10) / 10;
  const valid = validateBodyWeightKg(roundedKg, "imperial");
  check("validateBodyWeightKg: 661 lb accepted for imperial", valid, `kg=${roundedKg}`);
}

// Metric: 25 kg and 300 kg
{
  const valid25 = validateBodyWeightKg(25, "metric");
  const valid300 = validateBodyWeightKg(300, "metric");
  check("validateBodyWeightKg: 25 kg accepted for metric", valid25);
  check("validateBodyWeightKg: 300 kg accepted for metric", valid300);
}

// Metric: 24.9 kg and 300.1 kg rejected
{
  const valid24_9 = validateBodyWeightKg(24.9, "metric");
  const valid300_1 = validateBodyWeightKg(300.1, "metric");
  check("validateBodyWeightKg: 24.9 kg rejected for metric", !valid24_9, valid24_9 ? "accepted" : "");
  check("validateBodyWeightKg: 300.1 kg rejected for metric", !valid300_1, valid300_1 ? "accepted" : "");
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
