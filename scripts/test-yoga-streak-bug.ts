/**
 * Reproduce production bug: yoga session doesn't increment streak or days trained
 */

import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

function check(label: string, pass: boolean): void {
  if (!pass) {
    console.error(`✗ FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

console.log("\n=== REPRODUCING PROD BUG: Yoga session doesn't increment streak ===\n");

// Simulate the exact prod scenario:
// User had 1 strength session (streak=1, days=1)
// Then did a 16-min yoga session
// Expected: streak=2, days=2
// Actual in prod: streak=1, days=1

const programs = [
  { id: "prog-1", startedOn: "2026-10-01", endsOn: "2026-10-28" },
];

const dayTypesByProgram: Record<string, Record<number, DayType>> = {
  "prog-1": {
    1: "weights",    // Monday
    2: "rest",       // Tuesday  
    3: "bodyweight", // Wednesday
    4: "rest",       // Thursday
    5: "weights",    // Friday
    6: "yoga",       // Saturday
    7: "rest",       // Sunday
  },
};

// Day 1 (Oct 1): completed strength session
// Day 6 (Oct 6): completed yoga session  
const completedSessions = [
  { local_date: "2026-10-01", actual_type: "weights" as DayType },
  { local_date: "2026-10-06", actual_type: "yoga" as DayType },
];

const today = "2026-10-06";

const dayRecords = buildDayRecords({
  programs,
  dayTypesByProgram,
  completedSessions,
  today,
});

const streaks = computeStreaks(dayRecords, today);

console.log(`Current streak: ${streaks.current}`);
console.log(`Days trained: ${streaks.totalSessions}`);
console.log(`Longest streak: ${streaks.longest}\n`);

check("Streak should be 2 (not 1)", streaks.current === 2);
check("Days trained should be 2 (not 1)", streaks.totalSessions === 2);
check("Longest should be 2", streaks.longest === 2);

// Test that yoga session is actually in the day records with correct type
const yogaDay = dayRecords.find(d => d.localDate === "2026-10-06");
check("Yoga day exists in records", yogaDay !== undefined);
check("Yoga day shows as completed", yogaDay?.completed === true);
check("Yoga day has correct actual type", yogaDay?.actualSessionType === "yoga");

console.log("\n=== ALL CHECKS PASSED: TypeScript logic is CORRECT ===");
console.log("Bug must be in database query/view layer\n");
