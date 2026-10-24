/**
 * Test that planning ownership is separate from streak counting.
 * 
 * - Strength sessions (weights/bodyweight) settle the day for planning
 * - Yoga and breathing sessions do NOT settle the day - they're "anytime" activities
 * - But yoga DOES count toward streaks and days trained
 * 
 *   npx tsx scripts/test-planning-ownership.ts
 */
import { ownsPlannedWorkout, countsTowardStreak } from "../src/lib/progress/training-days";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Strength sessions settle the day for planning");
{
  check("weights settles day for planning", ownsPlannedWorkout("weights"));
  check("bodyweight settles day for planning", ownsPlannedWorkout("bodyweight"));
}

console.log("\n2. Yoga and breathing do NOT settle the day for planning");
{
  check("yoga does NOT settle day for planning", !ownsPlannedWorkout("yoga"));
  check("meditation does NOT settle day for planning", !ownsPlannedWorkout("meditation"));
  check("rest does NOT settle day", !ownsPlannedWorkout("rest"));
  check("null does NOT settle day", !ownsPlannedWorkout(null));
}

console.log("\n3. But yoga DOES count toward streaks");
{
  check("weights counts toward streak", countsTowardStreak("weights"));
  check("bodyweight counts toward streak", countsTowardStreak("bodyweight"));
  check("yoga counts toward streak", countsTowardStreak("yoga"));
}

console.log("\n4. Breathing does NOT count toward streaks");
{
  check("meditation does NOT count toward streak", !countsTowardStreak("meditation"));
  check("rest does NOT count toward streak", !countsTowardStreak("rest"));
  check("active_recovery does NOT count toward streak", !countsTowardStreak("active_recovery"));
  check("null does NOT count toward streak", !countsTowardStreak(null));
}

console.log("\n5. Product rule: planning ownership != streak counting");
{
  // The key distinction: yoga counts for streaks but not planning
  check("yoga counts for streak but not planning",
    countsTowardStreak("yoga") && !ownsPlannedWorkout("yoga"));
  
  // Strength sessions count for both
  check("weights counts for both",
    countsTowardStreak("weights") && ownsPlannedWorkout("weights"));
  
  // Breathing counts for neither
  check("meditation counts for neither",
    !countsTowardStreak("meditation") && !ownsPlannedWorkout("meditation"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
