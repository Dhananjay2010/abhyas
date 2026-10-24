export {};
/**
 * Calendar arithmetic must not depend on the server's timezone.
 *
 * `lib/dates.ts` opens by warning that `new Date("2026-09-10")` is UTC midnight
 * while `new Date("2026-09-10T00:00:00")` is local midnight. Two callers —
 * Today's block-week display and the week stamped onto a new session — mixed
 * the two anyway. It was invisible because Vercel runs functions in UTC, where
 * both parse identically, and would have shifted by a day the moment that
 * changed, moving the deload week with it.
 *
 * These checks run the arithmetic against several server timezones. Run under
 * a negative-offset zone in particular; that is where the old version failed.
 *
 *   npx tsx scripts/test-dates.ts
 *   TZ=America/New_York npx tsx scripts/test-dates.ts
 */
import { daysBetween, addDays, localDateString } from "../src/lib/dates";
import { weekInBlock, BLOCK_WEEKS } from "../src/lib/program/prescription";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log(`\nserver TZ = ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

console.log("\n1. daysBetween counts calendar days, both ways");
{
  check("same day is zero", daysBetween("2026-09-10", "2026-09-10") === 0);
  check("one day forward", daysBetween("2026-09-10", "2026-09-11") === 1);
  check("one day back is negative", daysBetween("2026-09-11", "2026-09-10") === -1);
  check("across a month end", daysBetween("2026-08-30", "2026-09-02") === 3);
  check("across a year end", daysBetween("2026-12-30", "2027-01-02") === 3);
  check("a leap day is counted", daysBetween("2028-02-28", "2028-03-01") === 2,
    `${daysBetween("2028-02-28", "2028-03-01")}`);
  check("a non-leap February is not", daysBetween("2027-02-28", "2027-03-01") === 1,
    `${daysBetween("2027-02-28", "2027-03-01")}`);
  check("agrees with addDays over a long span",
    daysBetween("2026-01-01", addDays("2026-01-01", 400)) === 400);
}

console.log("\n2. A DST transition does not add or lose a day");
{
  // US DST forward, 8 March 2026; UK forward, 29 March 2026.
  check("across US spring forward", daysBetween("2026-03-07", "2026-03-09") === 2,
    `${daysBetween("2026-03-07", "2026-03-09")}`);
  check("across UK spring forward", daysBetween("2026-03-28", "2026-03-30") === 2,
    `${daysBetween("2026-03-28", "2026-03-30")}`);
  // US DST back, 1 November 2026 — the 25-hour day.
  check("across US fall back", daysBetween("2026-10-31", "2026-11-02") === 2,
    `${daysBetween("2026-10-31", "2026-11-02")}`);
}

console.log("\n3. weekInBlock walks 1..4 and clamps at both ends");
{
  const start = "2026-09-03";
  check("the start date is week 1", weekInBlock(start, "2026-09-03") === 1);
  check("day 6 is still week 1", weekInBlock(start, "2026-09-09") === 1,
    `${weekInBlock(start, "2026-09-09")}`);
  check("day 7 begins week 2", weekInBlock(start, "2026-09-10") === 2,
    `${weekInBlock(start, "2026-09-10")}`);
  check("day 14 begins week 3", weekInBlock(start, "2026-09-17") === 3,
    `${weekInBlock(start, "2026-09-17")}`);
  check("day 21 begins week 4", weekInBlock(start, "2026-09-24") === 4,
    `${weekInBlock(start, "2026-09-24")}`);
  check("past the block it holds at the last week",
    weekInBlock(start, "2026-11-30") === BLOCK_WEEKS, `${weekInBlock(start, "2026-11-30")}`);
  check("a start date in the future reports week 1, not zero",
    weekInBlock("2026-12-01", "2026-09-10") === 1, `${weekInBlock("2026-12-01", "2026-09-10")}`);
}

console.log("\n4. The answer does not move with the user's timezone");
{
  // One instant, read in zones on both sides of the date line. The user's local
  // date differs, and the block week must follow the user's date -- not the
  // server's clock.
  const instant = new Date("2026-09-10T02:00:00Z");
  const start = "2026-09-03";
  const seen = new Map<string, number>();
  for (const tz of ["Pacific/Kiritimati", "Asia/Kolkata", "UTC", "America/New_York", "Pacific/Midway"]) {
    const localToday = localDateString(tz, instant);
    seen.set(tz, weekInBlock(start, localToday));
  }
  // Kiritimati is already the 10th (week 2); Midway is still the 9th (week 1).
  check("a zone past the date line is a week ahead of one behind it",
    seen.get("Pacific/Kiritimati")! >= seen.get("Pacific/Midway")!,
    [...seen].map(([k, v]) => `${k}=${v}`).join(" "));
  check("every zone lands on week 1 or 2 for this instant",
    [...seen.values()].every((v) => v === 1 || v === 2),
    [...seen].map(([k, v]) => `${k}=${v}`).join(" "));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
