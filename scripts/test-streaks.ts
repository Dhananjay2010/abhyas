/**
 * Streak rules: rest days are part of the plan, so they must never break a
 * streak, and an incomplete today must not either.
 *
 * Product rule (2026-10-24): ANY completed strength or yoga session counts toward
 * the streak, regardless of the template schedule. A "train anyway" session on a
 * template rest day counts. Breathing practices never count.
 *
 *   npx tsx scripts/test-streaks.ts
 */
import {
  buildDayRecords,
  computeStreaks,
  dateRange,
  isoWeekday,
  type DayRecord,
} from "../src/lib/progress/streaks";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const d = (
  localDate: string,
  dayType: DayRecord["dayType"],
  completed: boolean,
  actualSessionType: DayRecord["actualSessionType"] = null
): DayRecord =>
  ({ localDate, dayType, completed, actualSessionType });

console.log("\n1. Rest days do not break a streak");
{
  const days = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "rest", false, null),
    d("2026-09-03", "weights", true, "weights"),
    d("2026-09-04", "rest", false, null),
    d("2026-09-05", "weights", true, "weights"),
  ];
  const s = computeStreaks(days, "2026-09-05");
  check("current streak is 3", s.current === 3, `${s.current}`);
  check("total sessions is 3", s.totalSessions === 3, `${s.totalSessions}`);
}

console.log("\n2. A missed training day breaks it");
{
  const days = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", false, null),
    d("2026-09-03", "weights", true, "weights"),
    d("2026-09-04", "weights", true, "weights"),
  ];
  const s = computeStreaks(days, "2026-09-04");
  check("current streak is 2", s.current === 2, `${s.current}`);
  check("longest remembers the earlier run", s.longest === 2, `${s.longest}`);
}

console.log("\n3. An unfinished today does not break the streak");
{
  const days = [
    d("2026-09-03", "weights", true, "weights"),
    d("2026-09-04", "weights", true, "weights"),
    d("2026-09-05", "weights", false, null),
  ];
  const s = computeStreaks(days, "2026-09-05");
  check("today is skipped, streak stays 2", s.current === 2, `${s.current}`);
}

console.log("\n4. A yoga day counts as a training day");
{
  const days = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "yoga", true, "yoga"),
    d("2026-09-03", "weights", true, "weights"),
  ];
  check("streak is 3", computeStreaks(days, "2026-09-03").current === 3);

  const missedYoga = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "yoga", false, null),
    d("2026-09-03", "weights", true, "weights"),
  ];
  check("a missed yoga day breaks it", computeStreaks(missedYoga, "2026-09-03").current === 1);
}

console.log("\n5. Edges");
{
  check("no history is zero", computeStreaks([], "2026-09-05").current === 0);
  const allRest = [d("2026-09-01", "rest", false, null), d("2026-09-02", "rest", false, null)];
  check("only rest days is zero, not a break", computeStreaks(allRest, "2026-09-02").current === 0);
  const future = [d("2026-09-10", "weights", true, "weights"), d("2026-09-01", "weights", true, "weights")];
  check("future days are ignored", computeStreaks([future[1], future[0]], "2026-09-05").current === 1);
  const longestPast = [
    d("2026-09-01", "weights", true, "weights"), d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "weights", true, "weights"), d("2026-09-04", "weights", false, null),
    d("2026-09-05", "weights", true, "weights"),
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

console.log("\n7. Streaks span blocks");
{
  // Block 1 ends on the 4th, block 2 starts on the 5th. Training Mon/Wed/Fri
  // in both. A streak must not reset just because the block rolled over.
  const records = buildDayRecords({
    programs: [
      { id: "b1", startedOn: "2026-08-31", endsOn: "2026-09-04" },
      { id: "b2", startedOn: "2026-09-05", endsOn: "2026-10-02" },
    ],
    dayTypesByProgram: {
      b1: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "weights", 6: "rest", 7: "rest" },
      b2: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "weights", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-08-31", actual_type: "weights" },
      { local_date: "2026-09-02", actual_type: "weights" },
      { local_date: "2026-09-04", actual_type: "weights" },
      { local_date: "2026-09-07", actual_type: "weights" },
      { local_date: "2026-09-09", actual_type: "weights" },
    ],
    today: "2026-09-09",
  });
  const s = computeStreaks(records, "2026-09-09");
  check("streak carries across the block boundary", s.current === 5, `${s.current}`);
  check("every day between is accounted for", records.length === 10, `${records.length}`);
  check("a day in block 2 uses block 2's schedule",
    records.find((r) => r.localDate === "2026-09-07")?.dayType === "weights");

  const gap = buildDayRecords({
    programs: [{ id: "b1", startedOn: "2026-09-01", endsOn: "2026-09-03" }],
    dayTypesByProgram: { b1: { 1: "weights", 2: "weights", 3: "weights", 4: "weights", 5: "weights", 6: "weights", 7: "weights" } },
    completedSessions: [{ local_date: "2026-09-01", actual_type: "weights" }],
    today: "2026-09-05",
  });
  check("dates past a block's end still get a schedule", gap.length === 5, `${gap.length}`);
  check("no programs means no records",
    buildDayRecords({ programs: [], dayTypesByProgram: {}, completedSessions: [], today: "2026-09-05" }).length === 0);
}

console.log("\n8. A block rebuilt the same day must not erase today's streak");
{
  // Regression: rebuilding on 9 Sept leaves two programs covering that date.
  // The retired one has Wednesday as rest; the active one has it as training.
  // Taking the older schedule made the streak skip a session just completed.
  const records = buildDayRecords({
    programs: [
      { id: "retired", startedOn: "2026-09-09", endsOn: "2026-10-06" },
      { id: "active", startedOn: "2026-09-09", endsOn: "2026-10-06" },
    ],
    dayTypesByProgram: {
      retired: { 1: "yoga", 2: "weights", 3: "rest", 4: "weights", 5: "weights", 6: "rest", 7: "rest" },
      active: { 1: "yoga", 2: "weights", 3: "weights", 4: "rest", 5: "weights", 6: "weights", 7: "rest" },
    },
    completedSessions: [{ local_date: "2026-09-09", actual_type: "weights" }],
    today: "2026-09-09",
  });
  check("today uses the newest block's schedule",
    records.find((r) => r.localDate === "2026-09-09")?.dayType === "weights",
    `${records.find((r) => r.localDate === "2026-09-09")?.dayType}`);
  const s = computeStreaks(records, "2026-09-09");
  check("streak counts the completed session", s.current === 1, `${s.current}`);
  check("days trained agrees with the streak",
    s.totalSessions === 1 && s.current === 1, `${s.totalSessions} vs ${s.current}`);
}

console.log("\n9. Train-anyway sessions count toward streak and days trained (MEDIUM priority fix)");
{
  // Product rule: ANY completed strength or yoga session counts, regardless of template.
  // A "train anyway" weights session on a template rest day must count.
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      // Monday: weights, Tuesday: rest, Wednesday: weights
      p1: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      // Train anyway on Tuesday (template rest day)
      { local_date: "2026-09-09", actual_type: "weights" },
    ],
    today: "2026-09-09",
  });
  const s = computeStreaks(records, "2026-09-09");
  check("train-anyway on rest day: streak is 1", s.current === 1, `${s.current}`);
  check("train-anyway on rest day: days trained is 1", s.totalSessions === 1, `${s.totalSessions}`);
  check("train-anyway: streak and days trained agree", s.current === s.totalSessions);
}

console.log("\n10. Breathe-only days don't count toward streak or days trained");
{
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "meditation", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      // Only breathing on Tuesday
      { local_date: "2026-09-09", actual_type: "meditation" },
    ],
    today: "2026-09-09",
  });
  const s = computeStreaks(records, "2026-09-09");
  check("breathe-only: streak is 0", s.current === 0, `${s.current}`);
  check("breathe-only: days trained is 0", s.totalSessions === 0, `${s.totalSessions}`);
  check("breathe-only: streak and days trained agree", s.current === s.totalSessions);
}

console.log("\n11. Yoga counts toward streak and days trained");
{
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "yoga", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-09-08", actual_type: "weights" },
      { local_date: "2026-09-09", actual_type: "yoga" },
      { local_date: "2026-09-10", actual_type: "weights" },
    ],
    today: "2026-09-10",
  });
  const s = computeStreaks(records, "2026-09-10");
  check("yoga: streak is 3", s.current === 3, `${s.current}`);
  check("yoga: days trained is 3", s.totalSessions === 3, `${s.totalSessions}`);
  check("yoga: streak and days trained agree", s.current === s.totalSessions);
}

console.log("\n12. Skipped sessions don't count");
{
  // A skipped session has completed=false, actualSessionType=null
  const days = [
    d("2026-09-08", "weights", true, "weights"),
    d("2026-09-09", "weights", false, null), // scheduled but not done
    d("2026-09-10", "weights", true, "weights"),
  ];
  const s = computeStreaks(days, "2026-09-10");
  check("skipped breaks streak", s.current === 1, `${s.current}`);
  check("skipped doesn't count toward days trained", s.totalSessions === 2, `${s.totalSessions}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
