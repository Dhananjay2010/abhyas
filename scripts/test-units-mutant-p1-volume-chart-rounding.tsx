#!/usr/bin/env tsx
/**
 * Mutant P1: Progress volume chart left unrounded ('10,902 lb').
 *
 * This test verifies that the volume chart applies Math.round() to imperial
 * values before displaying them. The mutant would show raw lb values with
 * decimals (e.g., '10,901.86 lb').
 */

import { buildVolumeChartPoints, buildBodyWeightChartPoints } from "../src/lib/progress/chart-points";

console.log("\nMutant P1: Progress volume chart must round imperial values\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const shortDate = (iso: string) => iso;

// Test 1: Volume chart with large imperial value (4945 kg)
console.log("\n1. Volume chart: 4945 kg → imperial");
const volumeRows = [{ local_date: "2026-10-26", volume_kg: 4945 }];
const volumePoints = buildVolumeChartPoints(volumeRows, "imperial", shortDate, new Set());

check(
  "4945 kg converts to whole number lb (no decimals)",
  Number.isInteger(volumePoints[0].value),
  `got ${volumePoints[0].value}`
);

check(
  "4945 kg displays as 10902 lb (not 10901.86)",
  volumePoints[0].value === 10902,
  `got ${volumePoints[0].value}`
);

// Test 2: Body weight chart with 78.02 kg
console.log("\n2. Body weight chart: 78.02 kg → imperial");
const weightRows = [{ recorded_on: "2026-10-26", weight_kg: 78.02 }];
const weightPoints = buildBodyWeightChartPoints(weightRows, "imperial", shortDate);

check(
  "78.02 kg rounds to 0.5 lb increment",
  weightPoints[0].value === 172,
  `got ${weightPoints[0].value}`
);

// Test 3: Metric identity (no conversion artifacts)
console.log("\n3. Metric identity");
const volumeMetric = buildVolumeChartPoints([{ local_date: "2026-10-26", volume_kg: 100 }], "metric", shortDate, new Set());
const weightMetric = buildBodyWeightChartPoints([{ recorded_on: "2026-10-26", weight_kg: 70 }], "metric", shortDate);

check(
  "Volume 100 kg stays 100 kg",
  volumeMetric[0].value === 100,
  `got ${volumeMetric[0].value}`
);

check(
  "Weight 70 kg stays 70 kg",
  weightMetric[0].value === 70,
  `got ${weightMetric[0].value}`
);

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed`);
  console.error("Mutant P1 (unrounded volume) would PASS this test.\n");
  process.exit(1);
}

console.log("\n✅ Mutant P1 killed: Volume chart rounds imperial values correctly\n");
