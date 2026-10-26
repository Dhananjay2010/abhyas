/**
 * L-d: Body-weight limits must be inclusive in display units.
 * 
 * Imperial: 55 lb and 661 lb accepted, 54.5 and 661.5 rejected
 * Metric: 25 kg and 300 kg accepted, 24.5 and 300.5 rejected
 */

import { parseWeight, lbToKg, kgToLb } from "@/lib/units";

console.log("\n🧪 L-d: Body-weight limits inclusive in display units\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// 1. Imperial bounds
// ============================================================

// 55 lb should be accepted (minimum)
{
  const kg = parseWeight(55, "imperial");
  check("Imperial 55 lb accepted", kg !== null, kg === null ? "rejected" : `got ${kg} kg`);
  if (kg !== null) {
    const display = kgToLb(kg);
    check("Imperial 55 lb round-trips correctly", display >= 54.5 && display <= 55.5);
  }
}

// 54.5 lb should be rejected (below minimum)
{
  const kg = parseWeight(54.5, "imperial");
  check("Imperial 54.5 lb rejected", kg === null, kg !== null ? `accepted as ${kg} kg` : "");
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

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
