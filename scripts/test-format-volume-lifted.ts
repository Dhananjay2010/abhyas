/**
 * Test formatVolumeLifted (FIX d): shows full numbers with thousands separators.
 *
 * Must FAIL on main: Progress showed '15t' for 14,800 kg instead of '14,800 kg'.
 */

import { formatVolumeLifted } from "../src/lib/session/format-volume-lifted";

console.log("Test formatVolumeLifted (FIX d)\n");

// Test 1: The reported case - 14,800 kg
const vol1 = formatVolumeLifted(14800, "metric");
const expected1 = "14,800 kg";
if (vol1 !== expected1) {
  console.error(`✗ 14,800 kg: expected "${expected1}", got "${vol1}"`);
  process.exit(1);
}
console.log(`✓ 14,800 kg: "${vol1}"`);

// Test 2: Smaller volume - no abbreviation
const vol2 = formatVolumeLifted(8500, "metric");
const expected2 = "8,500 kg";
if (vol2 !== expected2) {
  console.error(`✗ 8,500 kg: expected "${expected2}", got "${vol2}"`);
  process.exit(1);
}
console.log(`✓ 8,500 kg: "${vol2}"`);

// Test 3: Very large volume
const vol3 = formatVolumeLifted(125000, "metric");
const expected3 = "125,000 kg";
if (vol3 !== expected3) {
  console.error(`✗ 125,000 kg: expected "${expected3}", got "${vol3}"`);
  process.exit(1);
}
console.log(`✓ 125,000 kg: "${vol3}"`);

// Test 4: Imperial conversion
const vol4 = formatVolumeLifted(14800, "imperial");
// 14,800 kg = ~32,628 lb
const expected4 = "32,628 lb";
if (vol4 !== expected4) {
  console.error(`✗ Imperial: expected "${expected4}", got "${vol4}"`);
  process.exit(1);
}
console.log(`✓ Imperial (14,800 kg): "${vol4}"`);

// Test 5: Small number - no separator
const vol5 = formatVolumeLifted(500, "metric");
const expected5 = "500 kg";
if (vol5 !== expected5) {
  console.error(`✗ 500 kg: expected "${expected5}", got "${vol5}"`);
  process.exit(1);
}
console.log(`✓ 500 kg: "${vol5}"`);

// Test 6: Edge case - exactly 1,000
const vol6 = formatVolumeLifted(1000, "metric");
const expected6 = "1,000 kg";
if (vol6 !== expected6) {
  console.error(`✗ 1,000 kg: expected "${expected6}", got "${vol6}"`);
  process.exit(1);
}
console.log(`✓ 1,000 kg: "${vol6}"`);

console.log("\n✅ All formatVolumeLifted tests passed");
console.log("  On main: would show '15t' (abbreviated)");
console.log("  With fix: shows '14,800 kg' (full with separators)");
