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
  check("weights completed with sets counts toward streak", countsTowardStreak("weights", "completed", 1));
  check("bodyweight completed with sets counts toward streak", countsTowardStreak("bodyweight", "completed", 1));
  check("yoga completed counts toward streak", countsTowardStreak("yoga", "completed"));
}

console.log("\n4. Breathing does NOT count toward streaks");
{
  check("meditation does NOT count toward streak", !countsTowardStreak("meditation", "completed"));
  check("rest does NOT count toward streak", !countsTowardStreak("rest", "completed"));
  check("active_recovery does NOT count toward streak", !countsTowardStreak("active_recovery", "completed"));
  check("null does NOT count toward streak", !countsTowardStreak(null, "completed"));
}

console.log("\n5. Product rule: planning ownership != streak counting");
{
  // The key distinction: yoga counts for streaks but not planning
  check("yoga counts for streak but not planning",
    countsTowardStreak("yoga", "completed") && !ownsPlannedWorkout("yoga"));
  
  // Strength sessions count for both
  check("weights counts for both",
    countsTowardStreak("weights", "completed", 1) && ownsPlannedWorkout("weights"));
  
  // Breathing counts for neither
  check("meditation counts for neither",
    !countsTowardStreak("meditation", "completed") && !ownsPlannedWorkout("meditation"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
