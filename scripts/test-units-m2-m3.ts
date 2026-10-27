/**
 * Tests for M2 and M3 QA issues:
 * M2: Metric History list and detail must agree (both use 2 decimal places)
 * M3: Body weight displays at 0.1 lb precision (no rounding)
 */

import { 
  formatWeight, 
  formatTopSet,
  formatBodyWeight
} from "../src/lib/units";
import { buildBodyWeightChartPoints } from "../src/lib/progress/chart-points";
import type { WeightRow } from "../src/lib/progress/chart-points";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== M2: Metric History list and detail agreement ===\n");

// Test that formatWeight and formatTopSet agree for metric (2 decimal places)
const metricWeights = [
  { kg: 71.44, expected: "71.44 kg" },
  { kg: 85.27, expected: "85.27 kg" },
  { kg: 85.28, expected: "85.28 kg" },
  { kg: 35.15, expected: "35.15 kg" },
];

for (const { kg, expected } of metricWeights) {
  const fromFormatWeight = formatWeight(kg, "metric");
  check(
    `${kg} kg: formatWeight displays as "${expected}"`,
    fromFormatWeight === expected,
    `expected "${expected}", got "${fromFormatWeight}"`
  );
  
  const fromFormatTopSet = formatTopSet(kg, "metric");
  const expectedTopSet = `${expected} top`;
  check(
    `${kg} kg: formatTopSet displays as "${expectedTopSet}"`,
    fromFormatTopSet === expectedTopSet,
    `expected "${expectedTopSet}", got "${fromFormatTopSet}"`
  );
  
  check(
    `${kg} kg: formatWeight and formatTopSet agree`,
    fromFormatWeight === expected && fromFormatTopSet.startsWith(expected),
    `formatWeight="${fromFormatWeight}", formatTopSet="${fromFormatTopSet}"`
  );
}

console.log("\n=== M3: Body weight displays at 0.1 lb precision ===\n");

// Test that body weight displays at 0.1 lb precision without rounding
const bodyWeightKg = 77.38; // 170.6 lb
const expectedLb = 170.6;

// Test 1: formatBodyWeight shows 0.1 precision
const formattedBody = formatBodyWeight(bodyWeightKg, "imperial", false);
check(
  `${bodyWeightKg} kg: formatBodyWeight displays as "${expectedLb}"`,
  formattedBody === String(expectedLb),
  `expected "${expectedLb}", got "${formattedBody}"`
);

// Test 2: buildBodyWeightChartPoints preserves 0.1 precision
const mockRows: WeightRow[] = [
  { recorded_on: "2024-01-01", weight_kg: String(bodyWeightKg) },
];

const shortDate = (iso: string) => iso.substring(5, 10).replace("-", "/");
const chartPoints = buildBodyWeightChartPoints(mockRows, "imperial", shortDate);

check(
  `${bodyWeightKg} kg: chart point value is ${expectedLb} lb`,
  chartPoints[0].value === expectedLb,
  `expected ${expectedLb}, got ${chartPoints[0].value}`
);

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
