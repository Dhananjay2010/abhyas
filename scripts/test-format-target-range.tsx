/**
 * MEDIUM-5: Test formatTargetRange helper for session runner header display.
 * 
 * Guards against:
 * - Rendering '0 reps' or '0 seconds'
 * - min > max (invalid range)
 * - Handles min === max (single value)
 */

import { formatTargetRange } from "@/lib/session/format-target-range";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing formatTargetRange helper\n");

// --- Test 1: Normal rep range ---
check(
  "8-12 reps → '8–12 reps'",
  formatTargetRange({ min: 8, max: 12, metric: "reps" }) === "8–12 reps"
);

// --- Test 2: Single rep value ---
check(
  "11-11 reps → '11 reps'",
  formatTargetRange({ min: 11, max: 11, metric: "reps" }) === "11 reps"
);

// --- Test 3: Timed range ---
check(
  "30-60 seconds → '30–60s'",
  formatTargetRange({ min: 30, max: 60, metric: "seconds" }) === "30–60s"
);

// --- Test 4: Single timed value ---
check(
  "45-45 seconds → '45s'",
  formatTargetRange({ min: 45, max: 45, metric: "seconds" }) === "45s"
);

// --- Test 5: Guard against 0 reps ---
check(
  "0-12 reps → '— (invalid target)'",
  formatTargetRange({ min: 0, max: 12, metric: "reps" }) === "— (invalid target)"
);

// --- Test 6: Guard against 0 in max ---
check(
  "8-0 reps → '— (invalid target)'",
  formatTargetRange({ min: 8, max: 0, metric: "reps" }) === "— (invalid target)"
);

// --- Test 7: Guard against min > max ---
check(
  "12-8 reps (min > max) → '— (invalid range)'",
  formatTargetRange({ min: 12, max: 8, metric: "reps" }) === "— (invalid range)"
);

// --- Test 8: Guard against negative values ---
check(
  "-5 to 10 reps → '— (invalid target)'",
  formatTargetRange({ min: -5, max: 10, metric: "reps" }) === "— (invalid target)"
);

// --- Test 9: Single high rep value ---
check(
  "24-24 reps → '24 reps'",
  formatTargetRange({ min: 24, max: 24, metric: "reps" }) === "24 reps"
);

// --- Test 10: 120s cap single value ---
check(
  "120-120 seconds → '120s'",
  formatTargetRange({ min: 120, max: 120, metric: "seconds" }) === "120s"
);

// --- Summary ---
console.log("");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed\n`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed\n`);
