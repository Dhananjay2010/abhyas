#!/usr/bin/env tsx
/**
 * M1b (BLOCKING): snapPrescribedWeight with lb tolerance.
 *
 * QA swept 20-400 lb in 0.5 lb steps. Without SNAP_LB_EPSILON, 382 of 761
 * values (50%) come back 0.5 lb low due to kg→lb→storage(0.01 kg)→lb
 * round-trip floating-point imprecision.
 *
 * This test sweeps every 0.5 lb value from 20 to 400 and verifies:
 * 1. displayToKg(lb) → snapPrescribedWeight → back to lb gives exactly lb
 * 2. Critical values: 62.5 kg → 137.5 lb (not 138), 40 kg → 88 lb
 */

import { displayToKg, snapPrescribedWeight, kgToDisplay, roundLbToHalf } from "../src/lib/units";

console.log("\nM1b: snapPrescribedWeight lb tolerance sweep\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

// Test 1: Sweep every 0.5 lb value from 20 to 400
console.log("1. Sweeping 20-400 lb in 0.5 lb steps:");
let sweepFailures = 0;
const firstFailures: string[] = [];

for (let lb = 20; lb <= 400; lb += 0.5) {
  const kg = displayToKg(lb, "imperial");
  const snappedKg = snapPrescribedWeight(kg, "imperial");
  
  if (snappedKg === null) {
    sweepFailures++;
    if (firstFailures.length < 5) {
      firstFailures.push(`${lb} lb: snappedKg is null`);
    }
    continue;
  }
  
  const backToLb = roundLbToHalf(kgToDisplay(snappedKg, "imperial"));
  
  if (backToLb !== lb) {
    sweepFailures++;
    if (firstFailures.length < 5) {
      firstFailures.push(`${lb} lb → ${kg.toFixed(2)} kg → ${snappedKg.toFixed(2)} kg → ${backToLb} lb`);
    }
  }
}

if (sweepFailures > 0) {
  console.log(`  FAIL: ${sweepFailures} values failed round-trip`);
  firstFailures.forEach(f => console.log(`       ${f}`));
  failures++;
} else {
  console.log(`  ok   All 761 values (20-400 lb in 0.5 steps) round-trip correctly`);
}

// Test 2: Critical value 62.5 kg must give 137.5 lb (not 138)
console.log("\n2. Critical value: 62.5 kg → 137.5 lb (no false PB):");
const prescribedKg_625 = 62.5;
const snapped_625 = snapPrescribedWeight(prescribedKg_625, "imperial");

if (snapped_625 === null) {
  console.log("  FAIL: snapped result is null");
  failures++;
} else {
  const lb_625 = roundLbToHalf(kgToDisplay(snapped_625, "imperial"));
  console.log(`   62.5 kg → ${snapped_625.toFixed(2)} kg → ${lb_625} lb`);
  check("62.5 kg gives 137.5 lb", lb_625 === 137.5, `got ${lb_625} lb`);
  
  // Verify it never rounds UP (137.79 raw should give 137.5, not 138)
  const rawLb = kgToDisplay(prescribedKg_625, "imperial");
  console.log(`   (Raw conversion: 62.5 kg = ${rawLb.toFixed(2)} lb)`);
  check("Never rounds up past prescription", lb_625 <= rawLb, `snapped ${lb_625} > raw ${rawLb.toFixed(2)}`);
}

// Test 3: Critical value 40 kg must give 88 lb
console.log("\n3. Critical value: 40 kg → 88 lb:");
const prescribedKg_40 = 40;
const snapped_40 = snapPrescribedWeight(prescribedKg_40, "imperial");

if (snapped_40 === null) {
  console.log("  FAIL: snapped result is null");
  failures++;
} else {
  const lb_40 = roundLbToHalf(kgToDisplay(snapped_40, "imperial"));
  console.log(`   40 kg → ${snapped_40.toFixed(2)} kg → ${lb_40} lb`);
  check("40 kg gives 88 lb", lb_40 === 88, `got ${lb_40} lb`);
}

// Test 4: Verify metric is identity (unchanged)
console.log("\n4. Metric mode is identity:");
const metricKg = 62.5;
const snappedMetric = snapPrescribedWeight(metricKg, "metric");
check("Metric identity", snappedMetric === metricKg, `expected ${metricKg}, got ${snappedMetric}`);

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed\n`);
  process.exit(1);
}

console.log("\n✅ All snap tolerance tests passed\n");
