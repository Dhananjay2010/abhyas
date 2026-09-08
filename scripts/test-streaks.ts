/**
 * Streak rules: rest days are part of the plan, so they must never break a
 * streak, and an incomplete today must not either.
 *
 *   npx tsx scripts/test-streaks.ts
 */
import { computeStreaks, dateRange, isoWeekday, type DayRecord } from "../src/lib/progress/streaks";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const d = (localDate: string, dayType: DayRecord["dayType"], completed: boolean): DayRecord =>
  ({ localDate, dayType, completed });

console.log("\n1. Rest days do not break a streak");
{
  const days = [
    d("2026-09-01", "weights", true),
    d("2026-09-02", "rest", false),
    d("2026-09-03", "weights", true),
    d("2026-09-04", "rest", false),
    d("2026-09-05", "weights", true),
  ];
  const s = computeStreaks(days, "2026-09-05");
  check("current streak is 3", s.current === 3, `${s.current}`);
  check("total sessions is 3", s.totalSessions === 3, `${s.totalSessions}`);
}

console.log("\n2. A missed training day breaks it");
{
  const days = [
    d("2026-09-01", "weights", true),
    d("2026-09-02", "weights", false),
    d("2026-09-03", "weights", true),
    d("2026-09-04", "weights", true),
  ];
  const s = computeStreaks(days, "2026-09-04");
  check("current streak is 2", s.current === 2, `${s.current}`);
  check("longest remembers the earlier run", s.longest === 2, `${s.longest}`);
}

console.log("\n3. An unfinished today does not break the streak");
{
  const days = [
    d("2026-09-03", "weights", true),
    d("2026-09-04", "weights", true),
    d("2026-09-05", "weights", false),
  ];
  const s = computeStreaks(days, "2026-09-05");
  check("today is skipped, streak stays 2", s.current === 2, `${s.current}`);
}

console.log("\n4. A yoga day counts as a training day");
{
  const days = [
    d("2026-09-01", "weights", true),
    d("2026-09-02", "yoga", true),
    d("2026-09-03", "weights", true),
  ];
  check("streak is 3", computeStreaks(days, "2026-09-03").current === 3);

  const missedYoga = [
    d("2026-09-01", "weights", true),
    d("2026-09-02", "yoga", false),
    d("2026-09-03", "weights", true),
  ];
  check("a missed yoga day breaks it", computeStreaks(missedYoga, "2026-09-03").current === 1);
}

console.log("\n5. Edges");
{
  check("no history is zero", computeStreaks([], "2026-09-05").current === 0);
  const allRest = [d("2026-09-01", "rest", false), d("2026-09-02", "rest", false)];
  check("only rest days is zero, not a break", computeStreaks(allRest, "2026-09-02").current === 0);
  const future = [d("2026-09-10", "weights", false), d("2026-09-01", "weights", true)];
  check("future days are ignored", computeStreaks([future[1], future[0]], "2026-09-05").current === 1);
  const longestPast = [
    d("2026-09-01", "weights", true), d("2026-09-02", "weights", true),
    d("2026-09-03", "weights", true), d("2026-09-04", "weights", false),
    d("2026-09-05", "weights", true),
  ];
  const s = computeStreaks(longestPast, "2026-09-05");
  check("longest is 3 while current is 1", s.longest === 3 && s.current === 1,
    `longest ${s.longest}, current ${s.current}`);
}

console.log("\n6. Helpers");
{
  check("Monday is 1", isoWeekday("2026-09-07") === 1, `${isoWeekday("2026-09-07")}`);
  check("Sunday is 7", isoWeekday("2026-09-06") === 7, `${isoWeekday("2026-09-06")}`);
  check("range is inclusive", dateRange("2026-09-01", "2026-09-03").length === 3);
  check("range spans a month end",
    dateRange("2026-08-30", "2026-09-02").join(",") === "2026-08-30,2026-08-31,2026-09-01,2026-09-02",
    dateRange("2026-08-30", "2026-09-02").join(","));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
