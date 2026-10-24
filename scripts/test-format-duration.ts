export {};
/**
 * Duration formatting must be consistent across Breathe, Yoga and History.
 *
 * Before this change, a 38-second session showed "1 min" on completion but
 * "Under a minute" on the tab, and different views used different thresholds.
 * The shared formatters in `lib/format-duration.ts` fix this.
 *
 *   npx tsx scripts/test-format-duration.ts
 */
import { formatDuration, formatWeekDuration } from "../src/lib/format-duration";
import { formatClock } from "../src/lib/session/device";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. formatClock produces m:ss format");
{
  check("zero seconds", formatClock(0) === "0:00");
  check("38 seconds", formatClock(38) === "0:38");
  check("60 seconds", formatClock(60) === "1:00");
  check("65 seconds", formatClock(65) === "1:05");
  check("720 seconds (12 min)", formatClock(720) === "12:00");
  check("negative rounds to zero", formatClock(-5) === "0:00");
}

console.log("\n2. formatDuration shows rounded minutes or 'Under a minute'");
{
  check("zero is '0 min'", formatDuration(0) === "0 min");
  check("38 seconds is 'Under a minute'", formatDuration(38) === "Under a minute");
  check("59 seconds is 'Under a minute'", formatDuration(59) === "Under a minute");
  check("60 seconds is '1 min'", formatDuration(60) === "1 min");
  check("90 seconds rounds to '2 min'", formatDuration(90) === "2 min",
    `got '${formatDuration(90)}'`);
  check("30 seconds rounds to '1 min'", formatDuration(30) === "Under a minute",
    `got '${formatDuration(30)}'`);
  check("720 seconds is '12 min'", formatDuration(720) === "12 min");
}

console.log("\n3. formatWeekDuration adds context for weekly stats");
{
  check("zero seconds", formatWeekDuration(0) === "Nothing yet this week");
  check("38 seconds", formatWeekDuration(38) === "Under a minute this week");
  check("59 seconds", formatWeekDuration(59) === "Under a minute this week");
  check("60 seconds", formatWeekDuration(60) === "1 min this week");
  check("90 seconds", formatWeekDuration(90) === "2 min this week");
  check("720 seconds", formatWeekDuration(720) === "12 min this week");
}

console.log("\n4. Edge cases");
{
  check("very large duration", formatDuration(86400) === "1440 min",
    `got '${formatDuration(86400)}'`);
  check("fractional second (should not happen)", formatDuration(38.7) === "Under a minute");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
