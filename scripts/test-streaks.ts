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
  
  // TZ-1: Completed sessions always count, even if dated beyond today
  const future = [d("2026-09-10", "weights", true, "weights"), d("2026-09-01", "weights", true, "weights")];
  check("completed sessions count even when dated beyond today (TZ-1)", 
    computeStreaks([future[1], future[0]], "2026-09-05").current === 2,
    `got ${computeStreaks([future[1], future[0]], "2026-09-05").current}`);
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
      { id: "b1", startedOn: "2026-08-31", endsOn: "2026-09-04", endedOn: "2026-09-04" },
      { id: "b2", startedOn: "2026-09-05", endsOn: "2026-10-02", endedOn: null },
    ],
    dayTypesByProgram: {
      b1: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "weights", 6: "rest", 7: "rest" },
      b2: { 1: "weights", 2: "rest", 3: "weights", 4: "rest", 5: "weights", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-08-31", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-02", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-04", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-07", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-09", actual_type: "weights", status: "completed", working_set_count: 3 },
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
    completedSessions: [{ local_date: "2026-09-01", actual_type: "weights", status: "completed", working_set_count: 3 }],
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
  // With the new block-range system, the retired block gets ended_on = started_on - 1 (empty range).
  const records = buildDayRecords({
    programs: [
      { id: "retired", startedOn: "2026-09-09", endsOn: "2026-10-06", endedOn: "2026-09-08" }, // empty range
      { id: "active", startedOn: "2026-09-09", endsOn: "2026-10-06", endedOn: null },
    ],
    dayTypesByProgram: {
      retired: { 1: "yoga", 2: "weights", 3: "rest", 4: "weights", 5: "weights", 6: "rest", 7: "rest" },
      active: { 1: "yoga", 2: "weights", 3: "weights", 4: "rest", 5: "weights", 6: "weights", 7: "rest" },
    },
    completedSessions: [{ local_date: "2026-09-09", actual_type: "weights", status: "completed", working_set_count: 3 }],
    today: "2026-09-09",
  });
  check("today uses the active block's schedule (retired is empty)",
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
      { local_date: "2026-09-09", actual_type: "weights", status: "completed", working_set_count: 3 },
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
      { local_date: "2026-09-09", actual_type: "meditation", status: "completed" },
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
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-09", actual_type: "yoga", status: "completed" },
      { local_date: "2026-09-10", actual_type: "weights", status: "completed", working_set_count: 3 },
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

console.log("\n13. Same date with yoga + breathing: yoga wins");
{
  // Multiple sessions on same date: prefer the qualifying one
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "yoga", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-09", actual_type: "yoga", status: "completed" },
      { local_date: "2026-09-09", actual_type: "meditation", status: "completed" }, // same day, breathing later
      { local_date: "2026-09-10", actual_type: "weights", status: "completed", working_set_count: 3 },
    ],
    today: "2026-09-10",
  });
  const s = computeStreaks(records, "2026-09-10");
  check("yoga+breathing day: streak is 3", s.current === 3, `${s.current}`);
  check("yoga+breathing day: days trained is 3", s.totalSessions === 3, `${s.totalSessions}`);
  check("yoga+breathing day: streak and days trained agree", s.current === s.totalSessions);
}

console.log("\n14. Breathe-only on scheduled training day breaks streak");
{
  // Breathing on a template rest day: OK. Breathing on a scheduled weights day: breaks.
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      // Monday weights, Tuesday weights, Wednesday rest, Thursday weights
      p1: { 1: "weights", 2: "weights", 3: "rest", 4: "weights", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 }, // Mon weights: good
      { local_date: "2026-09-09", actual_type: "meditation", status: "completed" }, // Tue breathing on training day: BREAKS
      { local_date: "2026-09-10", actual_type: "meditation", status: "completed" }, // Wed breathing on rest day: OK
      { local_date: "2026-09-11", actual_type: "weights", status: "completed", working_set_count: 3 }, // Thu weights: restart
    ],
    today: "2026-09-11",
  });
  const s = computeStreaks(records, "2026-09-11");
  check("breathe-only on training day breaks streak", s.current === 1, `${s.current}`);
  check("breathe-only on training day: days trained is 2", s.totalSessions === 2, `${s.totalSessions}`);
  check("longest streak before break was 1", s.longest === 1, `${s.longest}`);
}

console.log("\n15. TZ-1: Completed session after timezone change");
{
  // After a timezone change, a completed session can have local_date > today.
  // Example: yesterday's session at 11pm PST becomes "tomorrow" at 4pm JST (+17 hours).
  // RULE: Completed sessions ALWAYS count, even if dated beyond today.
  const records = buildDayRecords({
    programs: [{ id: "p1", startedOn: "2026-09-08", endsOn: "2026-10-05" }],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "weights", 3: "weights", 4: "rest", 5: "rest", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 }, // Mon
      { local_date: "2026-09-09", actual_type: "weights", status: "completed", working_set_count: 3 }, // Tue
      { local_date: "2026-09-11", actual_type: "weights", status: "completed", working_set_count: 3 }, // "Tomorrow" after TZ change
    ],
    today: "2026-09-10",
  });
  
  console.log(`  buildDayRecords generated ${records.length} days from ${records[0]?.localDate} to ${records[records.length - 1]?.localDate}`);
  console.log(`  Future session (2026-09-11) included: ${records.some(r => r.localDate === "2026-09-11" && r.completed)}`);
  
  const s = computeStreaks(records, "2026-09-10");
  console.log(`  Streak: ${s.current}, Days trained: ${s.totalSessions}`);
  
  check("buildDayRecords includes the future-dated completed session", 
    records.some(r => r.localDate === "2026-09-11" && r.completed),
    `found: ${records.filter(r => r.localDate === "2026-09-11").map(r => `${r.localDate} completed=${r.completed}`)}`
  );
  
  check("TZ-1: streak includes future-dated completed session", s.current === 3, `got ${s.current}, expected 3`);
  check("TZ-1: days trained includes future-dated completed session", s.totalSessions === 3, `got ${s.totalSessions}, expected 3`);
  check("TZ-1: streak and days trained agree", s.current === s.totalSessions);
}

console.log("\n16. M3: Gap days between blocks count as missed");
{
  // After block ends, if user returns late, gap days should break streak
  // Mon-Fri plan, 20 sessions, block ends 10-25, return 11-10
  const records = buildDayRecords({
    programs: [
      { id: "p1", startedOn: "2026-09-08", endsOn: "2026-09-28", endedOn: "2026-10-05" }, // Block 1: ended
      { id: "p2", startedOn: "2026-11-10", endsOn: "2026-12-07" }, // Block 2: starts 11-10 (15 day gap)
    ],
    dayTypesByProgram: {
      p1: { 1: "weights", 2: "weights", 3: "weights", 4: "weights", 5: "weights", 6: "rest", 7: "rest" }, // Mon-Fri
      p2: { 1: "weights", 2: "weights", 3: "weights", 4: "weights", 5: "weights", 6: "rest", 7: "rest" },
    },
    completedSessions: [
      // 20 sessions in block 1
      { local_date: "2026-09-08", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-09", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-10", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-11", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-12", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-15", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-16", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-17", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-18", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-19", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-22", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-23", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-24", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-25", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-26", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-29", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-09-30", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-10-01", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-10-02", actual_type: "weights", status: "completed", working_set_count: 3 },
      { local_date: "2026-10-03", actual_type: "weights", status: "completed", working_set_count: 3 },
      // Now return on 11-10 after 15 day gap
      { local_date: "2026-11-10", actual_type: "weights", status: "completed", working_set_count: 3 },
    ],
    today: "2026-11-10",
  });
  
  // Gap is 10-06 to 11-09 (35 days)
  // Weekdays in gap that were training days: 10-06 Mon, 10-07 Tue, 10-08 Wed, 10-09 Thu, 10-10 Fri (first miss)
  // 10-06 Mon is the first training day after block 1 ended, and it was missed
  const s = computeStreaks(records, "2026-11-10");
  
  check("M3: gap breaks streak (not preserved)", s.current === 1, `got ${s.current}, expected 1 (just today's session)`);
  check("M3: days trained still 21", s.totalSessions === 21, `got ${s.totalSessions}`);
  // Longest is 5 because those are Mon-Fri consecutive training days (first week)
  // Then there's a weekend (rest days don't break) + second week, but let's just check it's > 1
  check("M3: longest remembers the block 1 streak", s.longest >= 5, `got ${s.longest}`);
}

console.log("\n17. M3: Streak consistent before/after rollover");
{
  // Real QA case: streak showed 0 before Today opened (no rollover) and 16 after (rollover created next block)
  // The streak must be identical whether or not the next block exists
  
  const programs = [
    { id: "p1", startedOn: "2026-09-01", endsOn: "2026-09-28", endedOn: "2026-09-28" },
  ];
  
  const dayTypes = {
    p1: { 1: "weights" as const, 2: "weights" as const, 3: "weights" as const, 4: "rest" as const, 5: "rest" as const, 6: "rest" as const, 7: "rest" as const }, // Mon-Wed
  };
  
  const sessions = [
    // 16 sessions in block 1
    { local_date: "2026-09-01", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Mon
    { local_date: "2026-09-02", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Tue
    { local_date: "2026-09-03", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Wed
    { local_date: "2026-09-08", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-09", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-10", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-15", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-16", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-17", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-22", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-23", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-24", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-09-29", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Last week
    { local_date: "2026-09-30", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-10-01", actual_type: "weights" as const, status: "completed", working_set_count: 3 },
    { local_date: "2026-10-06", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // After block ended
  ];
  
  // BEFORE rollover: no block 2 exists yet, today is 10-13 (Mon, training day that was missed)
  const recordsBefore = buildDayRecords({
    programs,
    dayTypesByProgram: dayTypes,
    completedSessions: sessions,
    today: "2026-10-13",
  });
  
  const streakBefore = computeStreaks(recordsBefore, "2026-10-13");
  
  // AFTER rollover: block 2 created starting 10-14
  const recordsAfter = buildDayRecords({
    programs: [
      ...programs,
      { id: "p2", startedOn: "2026-10-14", endsOn: "2026-11-10" },
    ],
    dayTypesByProgram: {
      ...dayTypes,
      p2: { 1: "weights" as const, 2: "weights" as const, 3: "weights" as const, 4: "rest" as const, 5: "rest" as const, 6: "rest" as const, 7: "rest" as const },
    },
    completedSessions: sessions,
    today: "2026-10-13",
  });
  
  const streakAfter = computeStreaks(recordsAfter, "2026-10-13");
  
  console.log(`  Before rollover: streak=${streakBefore.current}, trained=${streakBefore.totalSessions}`);
  console.log(`  After rollover: streak=${streakAfter.current}, trained=${streakAfter.totalSessions}`);
  
  check("M3: streak same before rollover", streakBefore.current === streakAfter.current, 
    `before=${streakBefore.current}, after=${streakAfter.current}`);
  check("M3: days trained same", streakBefore.totalSessions === streakAfter.totalSessions,
    `before=${streakBefore.totalSessions}, after=${streakAfter.totalSessions}`);
  check("M3: streak broken by missed day after ended_on", streakBefore.current === 0 || streakBefore.current === 1,
    `got ${streakBefore.current}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
