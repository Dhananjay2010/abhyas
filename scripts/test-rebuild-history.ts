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
    { local_date: "2026-10-19", actual_type: "weights" as DayType }, // Mon
    { local_date: "2026-10-21", actual_type: "weights" as DayType }, // Wed
    { local_date: "2026-10-23", actual_type: "weights" as DayType }, // Fri
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
    { local_date: "2026-10-19", actual_type: "weights" as DayType },
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
  // Block 1 started Oct 1, rebuilt Oct 15 (week 3)
  // Old block: week_offset 0, Oct 15 is week 3
  // New block: week_offset 2 (so Oct 15 is still week 3)
  
  const programs = [
    {
      id: "block1",
      startedOn: "2026-10-01",
      endsOn: "2026-10-28",
      endedOn: "2026-10-14",
    },
    {
      id: "block2",
      startedOn: "2026-10-15",
      endsOn: "2026-11-11",
      endedOn: null,
    },
  ];

  // All training days to avoid rest-day breaks in the streak
  const dayTypesByProgram = {
    block1: { 
      1: "weights" as DayType, // Thu Oct 1
      2: "weights" as DayType, // Fri Oct 2
      3: "weights" as DayType, // Sat Oct 3
      4: "weights" as DayType, // Sun Oct 4
      5: "weights" as DayType, // Mon Oct 5
      6: "weights" as DayType, // Tue Oct 6
      7: "weights" as DayType, // Wed Oct 7
    },
    block2: { 
      1: "weights" as DayType,
      2: "weights" as DayType,
      3: "weights" as DayType,
      4: "weights" as DayType,
      5: "weights" as DayType,
      6: "weights" as DayType,
      7: "weights" as DayType,
    },
  };

  const completedSessions = [
    { local_date: "2026-10-01", actual_type: "weights" as DayType }, // Thu week 1
    { local_date: "2026-10-08", actual_type: "weights" as DayType }, // Thu week 2
    { local_date: "2026-10-14", actual_type: "weights" as DayType }, // Wed week 3
    { local_date: "2026-10-15", actual_type: "weights" as DayType }, // Thu week 3 (rebuild day)
  ];

  const dayRecords = buildDayRecords({
    programs,
    dayTypesByProgram,
    completedSessions,
    today: "2026-10-15",
  });

  // Check that days map to correct blocks
  const oct14 = dayRecords.find((d) => d.localDate === "2026-10-14");
  const oct15 = dayRecords.find((d) => d.localDate === "2026-10-15");
  check("Oct 14 uses block1", oct14?.dayType === "weights");
  check("Oct 15 uses block2", oct15?.dayType === "weights");

  const streaks = computeStreaks(dayRecords, "2026-10-15");
  check("all 4 sessions counted in days trained", streaks.totalSessions === 4, `${streaks.totalSessions}`);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED`);
  process.exit(1);
}
