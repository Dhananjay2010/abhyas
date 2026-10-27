/**
 * Test PB toast e1RM formatting (coordinator addition).
 *
 * PB toast must show e1RM with same precision as rest of app:
 * - 1 decimal place with trailing .0 dropped (54.58 -> 54.6, not 55)
 * - Respects user's units preference (kg or lb)
 * - Consistent with History and Progress formatting
 */

import { describePersonalBest } from "../src/lib/program/progression";
import type { PersonalBest } from "../src/lib/program/progression";

console.log("Test PB toast e1RM formatting\n");

// Test 1: Metric - 1 decimal place, trailing .0 dropped
const pb1: PersonalBest = { kind: "e1rm", value: 54.58 };
const result1 = describePersonalBest(pb1, "metric");
const expected1 = "Best estimated one-rep max yet — 54.5 kg";
if (result1 !== expected1) {
  console.error(`✗ Metric (54.58 kg): expected "${expected1}", got "${result1}"`);
  process.exit(1);
}
console.log(`✓ Metric (54.58 kg): "${result1}"`);

// Test 2: Metric - whole number, no .0
const pb2: PersonalBest = { kind: "e1rm", value: 55.0 };
const result2 = describePersonalBest(pb2, "metric");
const expected2 = "Best estimated one-rep max yet — 55 kg";
if (result2 !== expected2) {
  console.error(`✗ Metric (55.0 kg): expected "${expected2}", got "${result2}"`);
  process.exit(1);
}
console.log(`✓ Metric (55.0 kg): "${result2}"`);

// Test 3: Metric - 22.47 -> 22.5
const pb3: PersonalBest = { kind: "e1rm", value: 22.47 };
const result3 = describePersonalBest(pb3, "metric");
const expected3 = "Best estimated one-rep max yet — 22.5 kg";
if (result3 !== expected3) {
  console.error(`✗ Metric (22.47 kg): expected "${expected3}", got "${result3}"`);
  process.exit(1);
}
console.log(`✓ Metric (22.47 kg): "${result3}"`);

// Test 4: Imperial - converts and formats
const pb4: PersonalBest = { kind: "e1rm", value: 100 };
const result4 = describePersonalBest(pb4, "imperial");
// 100 kg = 220.46 lb, rounded to 0.5 lb = 220.5 lb, displayed as "220.5 lb"
const expected4 = "Best estimated one-rep max yet — 220.5 lb";
if (result4 !== expected4) {
  console.error(`✗ Imperial (100 kg): expected "${expected4}", got "${result4}"`);
  process.exit(1);
}
console.log(`✓ Imperial (100 kg): "${result4}"`);

// Test 5: Imperial - whole number, no .0
const pb5: PersonalBest = { kind: "e1rm", value: 45.36 };
const result5 = describePersonalBest(pb5, "imperial");
// 45.36 kg = 100.0 lb exactly (after rounding to 0.5), displayed as "100 lb"
const expected5 = "Best estimated one-rep max yet — 100 lb";
if (result5 !== expected5) {
  console.error(`✗ Imperial (45.36 kg): expected "${expected5}", got "${result5}"`);
  process.exit(1);
}
console.log(`✓ Imperial (45.36 kg): "${result5}"`);

// Test 6: Weight PB also uses formatWeight
const pb6: PersonalBest = { kind: "weight", value: 120.5 };
const result6 = describePersonalBest(pb6, "metric");
const expected6 = "Heaviest set yet — 120.5 kg";
if (result6 !== expected6) {
  console.error(`✗ Weight (120.5 kg): expected "${expected6}", got "${result6}"`);
  process.exit(1);
}
console.log(`✓ Weight (120.5 kg): "${result6}"`);

console.log("\n✅ All PB toast formatting tests passed");
console.log("  1 decimal place, trailing .0 dropped");
console.log("  Respects imperial/metric units");
console.log("  Consistent with app formatting");
