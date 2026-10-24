/**
 * Simplified test: back-to-back sessions with NO missed training days
 */

import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

const programs = [
  { id: "prog-1", startedOn: "2026-10-20", endsOn: "2026-11-16" },
];

// Simple schedule: strength and yoga back-to-back, no gaps
const dayTypesByProgram: Record<string, Record<number, DayType>> = {
  "prog-1": {
    1: "weights",  // Monday Oct 20
    2: "yoga",     // Tuesday Oct 21
    3: "rest",     // Wednesday
    4: "rest",  
    5: "rest",
    6: "rest",
    7: "rest",
  },
};

// Completed both days
const completedSessions = [
  { local_date: "2026-10-20", actual_type: "weights" as DayType },
  { local_date: "2026-10-21", actual_type: "yoga" as DayType },
];

const today = "2026-10-21";

const dayRecords = buildDayRecords({
  programs,
  dayTypesByProgram,
  completedSessions,
  today,
});

const streaks = computeStreaks(dayRecords, today);

console.log("\n=== SIMPLE TEST: Strength + Yoga back-to-back ===\n");
console.log(`Current streak: ${streaks.current} (expected: 2)`);
console.log(`Days trained: ${streaks.totalSessions} (expected: 2)`);
console.log(`Longest: ${streaks.longest} (expected: 2)\n`);

// Debug: show what we have
console.log("Day records:");
for (const d of dayRecords) {
  if (d.localDate <= today && (d.completed || d.dayType !== "rest")) {
    console.log(`  ${d.localDate}: ${d.dayType}, completed=${d.completed}, actualType=${d.actualSessionType}`);
  }
}

const pass = streaks.current === 2 && streaks.totalSessions === 2;
console.log(pass ? "\n✓ PASS\n" : "\n✗ FAIL\n");
process.exit(pass ? 0 : 1);
