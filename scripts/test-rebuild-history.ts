/**
 * Mid-block rebuild must not rewrite history or break streaks.
 *
 * Tests the fix for M-1: after a rebuild, past days still map to the old
 * block's schedule (via blockForDate), so the streak stays intact.
 *
 *   npx tsx scripts/test-rebuild-history.ts
 */
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import type { Database } from "../src/lib/database.types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type DayType = Database["public"]["Enums"]["day_type"];

console.log("\n1. Mid-block rebuild: past days use old block's schedule");
{
  // Block 1: Mon/Wed/Fri training, Tue/Thu/Sat/Sun rest
  // Sessions on Mon Oct 19, Wed Oct 21, Fri Oct 23 (all completed)
  // Then rebuild on Sat Oct 24 to 6-day schedule: Mon-Sat training, Sun rest
  
  const programs = [
    {
      id: "block1",
      startedOn: "2026-10-19",
      endsOn: "2026-11-15",
      endedOn: "2026-10-23", // ended_on set by rebuild_block RPC
    },
    {
      id: "block2",
      startedOn: "2026-10-24", // rebuild keeps started_on = today
      endsOn: "2026-11-20",
      endedOn: null,
    },
  ];

  const dayTypesByProgram = {
    block1: {
      1: "weights" as DayType, // Mon
      2: "rest" as DayType,    // Tue
      3: "weights" as DayType, // Wed
      4: "rest" as DayType,    // Thu
      5: "weights" as DayType, // Fri
      6: "rest" as DayType,    // Sat
      7: "rest" as DayType,    // Sun
    },
    block2: {
      1: "weights" as DayType, // Mon
      2: "weights" as DayType, // Tue
      3: "weights" as DayType, // Wed
      4: "weights" as DayType, // Thu
      5: "rest" as DayType,    // Fri
      6: "weights" as DayType, // Sat
      7: "rest" as DayType,    // Sun
    },
  };

  const completedSessions = [
    { local_date: "2026-10-19", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Mon
    { local_date: "2026-10-21", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Wed
    { local_date: "2026-10-23", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Fri
  ];

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today: "2026-10-24",
  });

  // Check that past days use block1's schedule
  const mon = dayRecords.find((d) => d.localDate === "2026-10-19");
  const tue = dayRecords.find((d) => d.localDate === "2026-10-20");
  const wed = dayRecords.find((d) => d.localDate === "2026-10-21");
  const thu = dayRecords.find((d) => d.localDate === "2026-10-22");

  check("Mon Oct 19 is training (block1)", mon?.dayType === "weights");
  check("Tue Oct 20 is rest (block1)", tue?.dayType === "rest");
  check("Wed Oct 21 is training (block1)", wed?.dayType === "weights");
  check("Thu Oct 22 is rest (block1)", thu?.dayType === "rest");

  // Check today uses block2's schedule
  const today = dayRecords.find((d) => d.localDate === "2026-10-24");
  check("Sat Oct 24 is training (block2)", today?.dayType === "weights");

  const streaks = computeStreaks(dayRecords, "2026-10-24");
  check("streak is 3, not broken by Tue/Thu rest days", streaks.current === 3, `${streaks.current}`);
  check("best streak is 3", streaks.longest === 3, `${streaks.longest}`);
  check("days trained is 3", streaks.totalSessions === 3, `${streaks.totalSessions}`);
}

console.log("\n2. Same-day rebuild: old block becomes empty range");
{
  // Block 1 started Oct 19, rebuilt same day (Oct 19)
  // Old block: ended_on = started_on - 1 = Oct 18 (empty range)
  const programs = [
    {
      id: "block1",
      startedOn: "2026-10-19",
      endsOn: "2026-11-15",
      endedOn: "2026-10-18", // empty range
    },
    {
      id: "block2",
      startedOn: "2026-10-19",
      endsOn: "2026-11-15",
      endedOn: null,
    },
  ];

  const dayTypesByProgram = {
    block1: { 1: "weights" as DayType },
    block2: { 1: "rest" as DayType },
  };

  const completedSessions = [
    { local_date: "2026-10-19", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 },
  ];

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today: "2026-10-19",
  });

  const day = dayRecords.find((d) => d.localDate === "2026-10-19");
  check("Oct 19 uses block2 (empty block1 covers nothing)", day?.dayType === "rest");
}

console.log("\n3. Legacy rebuild: completed block with same started_on");
{
  // Legacy behavior: old code kept started_on and marked old block 'completed'
  // After backfill, ended_on = next started_on - 1 = same day - 1 (empty range)
  const programs = [
    {
      id: "legacy-old",
      startedOn: "2026-10-15",
      endsOn: "2026-11-11",
      endedOn: "2026-10-14", // backfilled as empty
    },
    {
      id: "legacy-new",
      startedOn: "2026-10-15", // kept started_on
      endsOn: "2026-11-11",
      endedOn: null,
    },
  ];

  const dayTypesByProgram = {
    "legacy-old": { 3: "weights" as DayType }, // Wed
    "legacy-new": { 3: "rest" as DayType },
  };

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions: [],
    today: "2026-10-15",
  });

  const day = dayRecords.find((d) => d.localDate === "2026-10-15");
  check("legacy rebuild: new block wins (old is empty)", day?.dayType === "rest");
}

console.log("\n4. Rebuilt at week 3: sessions still count");
{
  // Block 1: Oct 13 (Tue) through Oct 16 (Fri)
  // Block 2: Oct 17 (Sat) onward
  // Oct 13=Tue, Oct 15=Thu, Oct 17=Sat
  
  const programs = [
    {
      id: "block1",
      startedOn: "2026-10-13",
      endsOn: "2026-11-09",
      endedOn: "2026-10-16",
    },
    {
      id: "block2",
      startedOn: "2026-10-17",
      endsOn: "2026-11-13",
      endedOn: null,
    },
  ];

  // Schedule by weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  const dayTypesByProgram = {
    block1: { 
      1: "rest" as DayType,    // Mon
      2: "weights" as DayType, // Tue Oct 13
      3: "rest" as DayType,    // Wed
      4: "weights" as DayType, // Thu Oct 15
      5: "rest" as DayType,    // Fri
      6: "rest" as DayType,    // Sat
      7: "rest" as DayType,    // Sun
    },
    block2: { 
      1: "rest" as DayType,    // Mon
      2: "rest" as DayType,    // Tue
      3: "rest" as DayType,    // Wed
      4: "rest" as DayType,    // Thu
      5: "rest" as DayType,    // Fri
      6: "weights" as DayType, // Sat Oct 17 (rebuild day)
      7: "rest" as DayType,    // Sun
    },
  };

  const completedSessions = [
    { local_date: "2026-10-13", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Tue
    { local_date: "2026-10-15", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Thu
    { local_date: "2026-10-17", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Sat (rebuild day)
  ];

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today: "2026-10-17",
  });

  // Check that days map to correct blocks
  const oct15 = dayRecords.find((d) => d.localDate === "2026-10-15");
  const oct17 = dayRecords.find((d) => d.localDate === "2026-10-17");
  check("Oct 15 uses block1", oct15?.dayType === "weights");
  check("Oct 17 uses block2", oct17?.dayType === "weights");

  const streaks = computeStreaks(dayRecords, "2026-10-17");
  check("all 3 sessions counted in days trained", streaks.totalSessions === 3, `${streaks.totalSessions}`);
  check("streak is 3 (rest days don't break it)", streaks.current === 3, `${streaks.current}`);
}

console.log("\n5. Mid-block rebuild with GAP + M3: gap days inherit schedule");
{
  // M3 followup: Gap days now inherit the previous block's schedule.
  //
  // Bug scenario: Block rebuilt early, user took break, resumed later.
  // - Block A: Mon/Wed/Fri training, started Oct 1, PLANNED end Nov 5
  // - Rebuilt early on Oct 11, so ended_on = Oct 10
  // - GAP: User took 5 days off (Oct 11-15)
  // - Block B: Tue/Thu/Sat training, started Oct 16
  //
  // BUG on pre-PR#74 main: Used endsOn (Nov 5) for blockA, so Oct 12/14 (Mon/Wed in the GAP)
  // were incorrectly assigned to blockA coverage.
  //
  // PR#74 fix: Used ended_on (Oct 10), so Oct 12/14 had no block (defaulted to rest).
  //
  // M3 fix: Gap days inherit blockA's schedule. Oct 12 (Mon) and Oct 14 (Wed) are training days.
  // Missed training days break the streak, so streak drops from 3 to 2 after the gap.
  
  const programs = [
    {
      id: "blockA",
      startedOn: "2026-10-01",
      endsOn: "2026-11-05",     // PLANNED end
      endedOn: "2026-10-10",    // ACTUAL end (rebuilt early)
    },
    {
      id: "blockB",
      startedOn: "2026-10-16", // 5-day gap
      endsOn: "2026-11-20",
      endedOn: null,
    },
  ];

  const dayTypesByProgram = {
    blockA: {
      1: "weights" as DayType, // Mon Oct 12 falls here in main's bug
      2: "rest" as DayType,
      3: "weights" as DayType, // Wed Oct 14 falls here in main's bug
      4: "rest" as DayType,
      5: "weights" as DayType,
      6: "rest" as DayType,
      7: "rest" as DayType,
    },
    blockB: {
      1: "rest" as DayType,
      2: "weights" as DayType,
      3: "rest" as DayType,
      4: "weights" as DayType,
      5: "rest" as DayType,
      6: "weights" as DayType,
      7: "rest" as DayType,
    },
  };

  const completedSessions = [
    // Block A before rebuild
    { local_date: "2026-10-05", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Mon
    { local_date: "2026-10-07", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Wed
    { local_date: "2026-10-09", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Fri
    // GAP Oct 11-15: no sessions
    // Block B after gap
    { local_date: "2026-10-17", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Sat
    { local_date: "2026-10-20", actual_type: "weights" as DayType, status: "completed", working_set_count: 3 }, // Tue
  ];

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today: "2026-10-20",
  });

  // M3: Oct 12 and 14 (GAP days) inherit blockA's schedule (Mon/Wed = weights)
  const oct12 = dayRecords.find((d) => d.localDate === "2026-10-12"); // Mon
  const oct14 = dayRecords.find((d) => d.localDate === "2026-10-14"); // Wed
  
  check("M3: Oct 12 (gap Mon) inherits blockA training schedule", oct12?.dayType === "weights", `${oct12?.dayType}`);
  check("M3: Oct 14 (gap Wed) inherits blockA training schedule", oct14?.dayType === "weights", `${oct14?.dayType}`);

  const streaks = computeStreaks(dayRecords, "2026-10-20");
  
  // M3: Streak breaks at Oct 12 (first missed training day in gap), then restarts at Oct 17
  // Expected: streak 2 (just the 2 most recent sessions: Oct 17 & Oct 20)
  // Pre-PR#74 bug: streak 0 (endsOn Nov 5 caused phantom coverage, Oct 12/14 broke streak)
  check("M3: streak is 2 (gap training days broke it)", streaks.current === 2, `streak=${streaks.current}`);
  check("total sessions is 5", streaks.totalSessions === 5, `${streaks.totalSessions}`);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED`);
  process.exit(1);
}
