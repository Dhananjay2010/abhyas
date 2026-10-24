/**
 * Test that History top-set weight displays correctly in imperial units.
 *
 * Bug: History was showing kg values labeled as "lb" for imperial users.
 * Fix: formatTopSet converts and formats correctly.
 *
 * This test exercises the REAL code used in history-client.tsx.
 */

import { formatTopSet } from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nHistory top-set weight formatting (tests real formatTopSet helper)");

// Test metric formatting
const metric100 = formatTopSet(100, "metric");
check("100 kg formats as '100kg top' for metric users",
  metric100 === "100kg top",
  `got '${metric100}'`);

// Test imperial formatting
const imperial100 = formatTopSet(100, "imperial");
check("100 kg formats as '220lb top' for imperial users",
  imperial100 === "220lb top",
  `got '${imperial100}'`);

// Test rounding: 50 kg → 110.23 lb → rounds to 110
const imperial50 = formatTopSet(50, "imperial");
check("50 kg formats as '110lb top' for imperial users",
  imperial50 === "110lb top",
  `got '${imperial50}'`);

// Test rounding: 45.5 kg → 100.31 lb → rounds to 100
const imperial45 = formatTopSet(45.5, "imperial");
check("45.5 kg formats as '100lb top' for imperial users",
  imperial45 === "100lb top",
  `got '${imperial45}'`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
