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

// Test metric formatting with space before unit and thousands separators
const metric100 = formatTopSet(100, "metric");
check("100 kg formats as '100 kg top' for metric users (space before unit)",
  metric100 === "100 kg top",
  `got '${metric100}'`);

// Test imperial formatting with space and decimal
const imperial100 = formatTopSet(100, "imperial");
check("100 kg formats as '220.5 lb top' for imperial users (space, 1 decimal)",
  imperial100 === "220.5 lb top",
  `got '${imperial100}'`);

// Test rounding to 0.5 lb: 50 kg → 110.23 lb → 110 lb (nearest 0.5)
const imperial50 = formatTopSet(50, "imperial");
check("50 kg formats as '110 lb top' for imperial users (0.5 lb rounding)",
  imperial50 === "110 lb top",
  `got '${imperial50}'`);

// Test rounding to 0.5 lb: 45.5 kg → 100.31 lb → 100.5 lb (nearest 0.5)
const imperial45 = formatTopSet(45.5, "imperial");
check("45.5 kg formats as '100.5 lb top' for imperial users (0.5 lb rounding)",
  imperial45 === "100.5 lb top",
  `got '${imperial45}'`);

// Test decimal display with .0 dropped: 22.5 kg → 22.5 kg top
const metric22_5 = formatTopSet(22.5, "metric");
check("22.5 kg formats as '22.5 kg top' (space, shows decimal, no rounding)",
  metric22_5 === "22.5 kg top",
  `got '${metric22_5}'`);

// Test 42.5 kg (from QA report)
const metric42_5 = formatTopSet(42.5, "metric");
check("42.5 kg formats as '42.5 kg top' (space)",
  metric42_5 === "42.5 kg top",
  `got '${metric42_5}'`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
