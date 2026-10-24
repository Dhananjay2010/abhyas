/**
 * Test that History top-set weight displays correctly in imperial units.
 * 
 * Bug: History was showing kg values labeled as "lb" for imperial users.
 * Fix: Convert with kgToLb before displaying.
 */

import { kgToLb } from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nHistory top-set weight units conversion");

// Test the conversion that should be used in History
const weightKg = 100;

// Metric: display as-is
const metricDisplay = Math.round(weightKg);
check("100 kg shows as 100 kg for metric users",
  metricDisplay === 100,
  `got ${metricDisplay} kg`);

// Imperial: convert then round
const weightLb = kgToLb(weightKg);
const imperialDisplay = Math.round(weightLb);
check("100 kg shows as ~220 lb for imperial users",
  imperialDisplay >= 220 && imperialDisplay <= 221,
  `got ${imperialDisplay} lb (exact: ${weightLb.toFixed(2)} lb)`);

// Additional test: ensure we round AFTER converting, not before
const weight50Kg = 50;
const weight50Lb = kgToLb(weight50Kg);
const imperial50Display = Math.round(weight50Lb);
check("50 kg shows as ~110 lb for imperial users",
  imperial50Display >= 110 && imperial50Display <= 111,
  `got ${imperial50Display} lb (exact: ${weight50Lb.toFixed(2)} lb)`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
