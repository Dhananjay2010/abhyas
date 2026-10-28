#!/usr/bin/env tsx
/**
 * M1: Held or unchanged weight shows NEAREST 0.5 lb, not floor.
 * 
 * Tests that 72.5 kg = 160 lb everywhere (runner, suggestion, logged rows, History)
 * and 62.5 kg = 138 lb. Only a prescribed INCREASE rounds down.
 */

import { kgToLb, roundLbToHalf, computeRunnerWeightPrefill, formatLoad, formatPrescribedWeight } from "../src/lib/units";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== M1: Held weight shows NEAREST 0.5 lb ===\n");

// Test case 1: 72.5 kg shows as 160 lb (nearest), not 159.5 lb (floor)
const kg1 = 72.5;
const lb1 = kgToLb(kg1);
const nearest1 = roundLbToHalf(lb1);
check("72.5 kg converts to ~160 lb", Math.abs(lb1 - 159.835) < 0.01, `got ${lb1}`);
check("Rounds to NEAREST 0.5 lb = 160", nearest1 === 160, `got ${nearest1}`);

const prefillHeld1 = computeRunnerWeightPrefill(kg1, "imperial", false, false);
check("Held weight prefill shows 160", prefillHeld1 === "160", `got "${prefillHeld1}"`);

const formatLoadHeld1 = formatLoad(kg1, "imperial");
check("formatLoad (logged rows) shows 160 lb", formatLoadHeld1 === "160 lb", `got "${formatLoadHeld1}"`);

// For comparison: prescribed increase would floor
const prefillIncrease1 = computeRunnerWeightPrefill(kg1, "imperial", false, true);
const prescribedDisplay1 = formatPrescribedWeight(kg1, "imperial");
check("Prescribed increase floors to 159.5 lb", prefillIncrease1 === "159.5", `got "${prefillIncrease1}"`);
check("formatPrescribedWeight floors to 159.5 lb", prescribedDisplay1 === "159.5 lb", `got "${prescribedDisplay1}"`);

console.log("");

// Test case 2: 62.5 kg shows as 138 lb (nearest), not 137.5 lb (floor)
const kg2 = 62.5;
const lb2 = kgToLb(kg2);
const nearest2 = roundLbToHalf(lb2);
check("62.5 kg converts to ~137.79 lb", Math.abs(lb2 - 137.789) < 0.01, `got ${lb2}`);
check("Rounds to NEAREST 0.5 lb = 138", nearest2 === 138, `got ${nearest2}`);

const prefillHeld2 = computeRunnerWeightPrefill(kg2, "imperial", false, false);
check("Held weight prefill shows 138", prefillHeld2 === "138", `got "${prefillHeld2}"`);

const formatLoadHeld2 = formatLoad(kg2, "imperial");
check("formatLoad (logged rows) shows 138 lb", formatLoadHeld2 === "138 lb", `got "${formatLoadHeld2}"`);

// For comparison: prescribed increase would floor
const prefillIncrease2 = computeRunnerWeightPrefill(kg2, "imperial", false, true);
const prescribedDisplay2 = formatPrescribedWeight(kg2, "imperial");
check("Prescribed increase floors to 137.5 lb", prefillIncrease2 === "137.5", `got "${prefillIncrease2}"`);
check("formatPrescribedWeight floors to 137.5 lb", prescribedDisplay2 === "137.5 lb", `got "${prescribedDisplay2}"`);

console.log("");

// Test case 3: 40 kg shows as 88 lb (which rounds down, but via nearest not floor)
const kg3 = 40;
const lb3 = kgToLb(kg3);
const nearest3 = roundLbToHalf(lb3);
check("40 kg converts to ~88.18 lb", Math.abs(lb3 - 88.185) < 0.01, `got ${lb3}`);
check("Rounds to NEAREST 0.5 lb = 88", nearest3 === 88, `got ${nearest3}`);

const prefillHeld3 = computeRunnerWeightPrefill(kg3, "imperial", false, false);
check("Held weight prefill shows 88", prefillHeld3 === "88", `got "${prefillHeld3}"`);

if (failures === 0) {
  console.log(`\n✓ All M1 tests passed\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
