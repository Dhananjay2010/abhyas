#!/usr/bin/env tsx
/**
 * Test that superseded blocks work correctly with streaks and training days.
 * 
 * When a plan is rebuilt mid-cycle, the old active block becomes 'superseded'.
 * Superseded blocks can still hold real training days, so streaks must not
 * break on the rebuild day.
 * 
 * This test uses string-compatible code that doesn't depend on #54's enum.
 */

import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting superseded blocks in streaks\n");

// Scenario: User has a 4-week block starting 2026-09-28 (Monday).
// They complete Week 1 and 2 (M/W/F). On 2026-10-12 (Monday of Week 3),
// they answer different profile questions and rebuild the plan.
// The old block becomes 'superseded', new block starts 2026-10-12.
// The streak should continue unbroken across the rebuild.

const programs = [
  {
    id: "block-1",
    startedOn: "2026-09-28", // Monday
    endsOn: "2026-10-25",    // Sunday (4 weeks)
  },
  {
    id: "block-2",
    startedOn: "2026-10-12", // Monday (rebuild day, Week 3 of old block)
    endsOn: "2026-11-08",    // Sunday (4 weeks)
  },
];

// M/W/F training days
const dayTypesByProgram = {
  "block-1": {
    1: "weights" as const,  // Monday
    2: "rest" as const,
    3: "weights" as const,  // Wednesday
    4: "rest" as const,
    5: "weights" as const,  // Friday
    6: "rest" as const,
    7: "rest" as const,
  },
  "block-2": {
    1: "weights" as const,  // Monday
    2: "rest" as const,
    3: "weights" as const,  // Wednesday
    4: "rest" as const,
    5: "weights" as const,  // Friday
    6: "rest" as const,
    7: "rest" as const,
  },
};

// User completed all M/W/F sessions in Week 1 and 2, then rebuilt on Monday of Week 3
const completedSessions = [
  // Week 1
  { local_date: "2026-09-28", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Mon
  { local_date: "2026-09-30", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Wed
  { local_date: "2026-10-02", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Fri
  // Week 2
  { local_date: "2026-10-05", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Mon
  { local_date: "2026-10-07", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Wed
  { local_date: "2026-10-09", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Fri
  // Week 3 - rebuilt on Monday, completed session after rebuild
  { local_date: "2026-10-12", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Mon (rebuild day)
  { local_date: "2026-10-14", actual_type: "weights" as const, status: "completed", working_set_count: 3 }, // Wed
];

const today = "2026-10-14"; // Wednesday of Week 3

const dayRecords = buildDayRecords({
  programs,
  dayTypesByProgram,
  completedSessions,
  today,
});

// Debug: print day records around the rebuild date
console.log("\nDay records from 2026-10-09 to 2026-10-14:");
dayRecords
  .filter((d) => d.localDate >= "2026-10-09" && d.localDate <= "2026-10-14")
  .forEach((d) => {
    console.log(
      `  ${d.localDate}: dayType=${d.dayType}, completed=${d.completed}, actualType=${d.actualSessionType}`
    );
  });
console.log("");

const streaks = computeStreaks(dayRecords, today);

console.log("1. Rebuild day (2026-10-12) should use new block's schedule");
const rebuildDay = dayRecords.find((d) => d.localDate === "2026-10-12");
check("rebuild day exists", !!rebuildDay);
check(
  "rebuild day uses new block (weights)",
  rebuildDay?.dayType === "weights",
  `got ${rebuildDay?.dayType}`
);
check("rebuild day shows completed", rebuildDay?.completed === true);

console.log("\n2. Pre-rebuild sessions should still appear");
const week1Monday = dayRecords.find((d) => d.localDate === "2026-09-28");
check("week 1 Monday exists", !!week1Monday);
check("week 1 Monday completed", week1Monday?.completed === true);

console.log("\n3. Streak should NOT break on rebuild day");
check(
  "current streak includes all 8 sessions",
  streaks.current === 8,
  `got ${streaks.current}`
);
check(
  "total sessions = 8",
  streaks.totalSessions === 8,
  `got ${streaks.totalSessions}`
);
check(
  "longest streak = 8",
  streaks.longest === 8,
  `got ${streaks.longest}`
);

console.log("\n4. Day records span both blocks");
const firstDay = dayRecords[0];
const lastDay = dayRecords[dayRecords.length - 1];
check("starts at block 1 start date", firstDay?.localDate === "2026-09-28", `got ${firstDay?.localDate}`);
check("ends at today", lastDay?.localDate === "2026-10-14", `got ${lastDay?.localDate}`);

console.log("\n5. Rebuild day with both programs covering the same date");
// Both block-1 and block-2 cover 2026-10-12.
// buildDayRecords should pick block-2 (newest) for that date.
const daysOnRebuildDate = dayRecords.filter((d) => d.localDate === "2026-10-12");
check(
  "only one record for rebuild date",
  daysOnRebuildDate.length === 1,
  `got ${daysOnRebuildDate.length}`
);

console.log("\n6. Rest days don't break streak");
// 2026-09-29 (Tuesday) and 2026-10-01 (Thursday) are rest days in Week 1
const restDayTue = dayRecords.find((d) => d.localDate === "2026-09-29");
const restDayThu = dayRecords.find((d) => d.localDate === "2026-10-01");
check("rest day Tuesday has type 'rest'", restDayTue?.dayType === "rest");
check("rest day Tuesday not completed", restDayThu?.completed === false);
// Streak calculation should skip these rest days

console.log("\n7. Superseded block still contributes to training days");
// All sessions from 2026-09-28 to 2026-10-09 were in the superseded block,
// but they should still count toward the streak and total sessions.
const sessionsFromSuperseded = completedSessions.filter(
  (s) => s.local_date >= "2026-09-28" && s.local_date < "2026-10-12"
).length;
check(
  "superseded block has 6 sessions",
  sessionsFromSuperseded === 6,
  `got ${sessionsFromSuperseded}`
);
check(
  "total sessions includes superseded block",
  streaks.totalSessions >= 6,
  `got ${streaks.totalSessions}`
);

if (failures === 0) {
  console.log("\n✅ All superseded block streak tests passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
