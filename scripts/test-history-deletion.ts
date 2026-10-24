/**
 * Test history deletion and its effect on streaks and days-trained.
 * 
 * Tests that deleting a session correctly updates:
 * - Current streak
 * - Longest streak
 * - Total days trained
 * 
 * Uses the shared rule: strength and yoga count toward streaks, breathing doesn't.
 * 
 *   npx tsx scripts/test-history-deletion.ts
 */

import {
  buildDayRecords,
  computeStreaks,
  type DayRecord,
} from "../src/lib/progress/streaks";
import { countsTowardStreak } from "../src/lib/progress/training-days";

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
): DayRecord => ({ localDate, dayType, completed, actualSessionType });

console.log("\n1. Deleting a session updates the streak");
{
  // Before deletion: 3-day streak
  const beforeDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakBefore = computeStreaks(beforeDeletion, "2026-09-03");
  check("streak before deletion is 3", streakBefore.current === 3, `${streakBefore.current}`);

  // After deleting the middle session
  const afterDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", false, null), // Deleted
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakAfter = computeStreaks(afterDeletion, "2026-09-03");
  check("streak after deletion is 1", streakAfter.current === 1, `${streakAfter.current}`);
  check(
    "longest is also 1 after deletion breaks history",
    streakAfter.longest === 1,
    `${streakAfter.longest}`
  );
}

console.log("\n2. Deleting the last session reduces the streak");
{
  const beforeDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakBefore = computeStreaks(beforeDeletion, "2026-09-03");
  check("streak before is 3", streakBefore.current === 3);

  // After deleting the last session
  const afterDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "weights", false, null), // Deleted
  ];
  const streakAfter = computeStreaks(afterDeletion, "2026-09-03");
  check("streak after deleting last is 2", streakAfter.current === 2, `${streakAfter.current}`);
}

console.log("\n3. Deleting a yoga session affects the streak");
{
  const beforeDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "yoga", true, "yoga"),
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakBefore = computeStreaks(beforeDeletion, "2026-09-03");
  check("streak with yoga is 3", streakBefore.current === 3);

  // After deleting the yoga session
  const afterDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "yoga", false, null), // Deleted
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakAfter = computeStreaks(afterDeletion, "2026-09-03");
  check(
    "streak after deleting yoga is 1 (broken)",
    streakAfter.current === 1,
    `${streakAfter.current}`
  );
}

console.log("\n4. Deleting a breathing session does NOT affect the streak");
{
  const beforeDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "meditation", true, "meditation"),
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakBefore = computeStreaks(beforeDeletion, "2026-09-03");
  check("streak before is 2 (breathing doesn't count)", streakBefore.current === 2);

  // After deleting the breathing session (shouldn't change anything)
  const afterDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "meditation", false, null), // Deleted
    d("2026-09-03", "weights", true, "weights"),
  ];
  const streakAfter = computeStreaks(afterDeletion, "2026-09-03");
  check("streak after deleting breathing is still 2", streakAfter.current === 2);
}

console.log("\n5. Total days trained is updated correctly");
{
  const beforeDeletion = [
    d("2026-09-01", "weights", true, "weights"),
    d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "yoga", true, "yoga"),
    d("2026-09-04", "meditation", true, "meditation"),
  ];
  const streakBefore = computeStreaks(beforeDeletion, "2026-09-04");
  check("total sessions before is 3 (breathing doesn't count)", streakBefore.totalSessions === 3);

  // After deleting a strength session
  const afterDeletion = [
    d("2026-09-01", "weights", false, null), // Deleted
    d("2026-09-02", "weights", true, "weights"),
    d("2026-09-03", "yoga", true, "yoga"),
    d("2026-09-04", "meditation", true, "meditation"),
  ];
  const streakAfter = computeStreaks(afterDeletion, "2026-09-04");
  check("total sessions after is 2", streakAfter.totalSessions === 2);
}

console.log("\n6. countsTowardStreak is consistent");
{
  check("weights counts", countsTowardStreak("weights"));
  check("bodyweight counts", countsTowardStreak("bodyweight"));
  check("yoga counts", countsTowardStreak("yoga"));
  check("meditation does not count", !countsTowardStreak("meditation"));
  check("rest does not count", !countsTowardStreak("rest"));
  check("active_recovery does not count", !countsTowardStreak("active_recovery"));
  check("null does not count", !countsTowardStreak(null));
}

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
}
