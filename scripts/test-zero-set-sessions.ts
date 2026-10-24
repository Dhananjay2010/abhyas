/**
 * Test that strength sessions with 0 working sets don't count toward streaks
 * or appear in History, while sessions with working sets do count.
 * 
 * Defense in depth: warmup-only sessions should not count toward training days.
 * 
 *   npx tsx scripts/test-zero-set-sessions.ts
 */

import { countsTowardStreak } from "../src/lib/progress/training-days";
import { countWorkingSets } from "../src/lib/session/count-sets";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting zero-set session exclusion\n");

// Test 1: Warmup-only strength session doesn't count
console.log("1. Strength session with only warmup sets");
const warmupOnlySets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
];
const warmupCount = countWorkingSets(warmupOnlySets);
const warmupCounts = countsTowardStreak("weights", warmupOnlySets);
check("0 working sets", warmupCount === 0, `got ${warmupCount}`);
check("does NOT count toward streak", !warmupCounts);

// Test 2: Strength session with no sets at all doesn't count
console.log("\n2. Strength session with no sets");
const noSets: typeof warmupOnlySets = [];
const noSetsCount = countWorkingSets(noSets);
const noSetsCounts = countsTowardStreak("weights", noSets);
check("0 working sets", noSetsCount === 0);
check("does NOT count toward streak", !noSetsCounts);

// Test 3: Strength session with one working set DOES count
console.log("\n3. Strength session with one working set");
const oneWorkingSet = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
];
const oneWorkingCount = countWorkingSets(oneWorkingSet);
const oneWorkingCounts = countsTowardStreak("weights", oneWorkingSet);
check("1 working set", oneWorkingCount === 1, `got ${oneWorkingCount}`);
check("DOES count toward streak", oneWorkingCounts);

// Test 4: Strength session with timed hold (no reps) DOES count
console.log("\n4. Strength session with one timed hold (0 reps, has duration)");
const timedHoldSets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: null, duration_seconds: 60 },
];
const timedHoldCount = countWorkingSets(timedHoldSets);
const timedHoldCounts = countsTowardStreak("bodyweight", timedHoldSets);
check("1 working set (timed)", timedHoldCount === 1, `got ${timedHoldCount}`);
check("DOES count toward streak", timedHoldCounts);

// Test 5: Yoga session always counts (no sets needed)
console.log("\n5. Yoga session (no sets passed)");
const yogaCounts = countsTowardStreak("yoga");
check("DOES count toward streak", yogaCounts);

// Test 6: Yoga session with sets also counts (backward compatible)
console.log("\n6. Yoga session (with sets passed)");
const yogaWithSets = [{ is_warmup_set: false, reps: null, duration_seconds: 1200 }];
const yogaWithSetsCounts = countsTowardStreak("yoga", yogaWithSets);
check("DOES count toward streak", yogaWithSetsCounts);

// Test 7: Breathing never counts
console.log("\n7. Breathing session");
const breathingCounts = countsTowardStreak("meditation");
check("does NOT count toward streak", !breathingCounts);

// Test 8: Backward compatibility - strength session without sets argument
console.log("\n8. Strength session (backward compatible, no sets passed)");
const strengthNoSets = countsTowardStreak("weights");
check("DOES count (backward compatible)", strengthNoSets);

// Test 9: Mixed warmup and working sets
console.log("\n9. Strength session with mixed warmup and working sets");
const mixedSets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
  { is_warmup_set: false, reps: 4, duration_seconds: null },
];
const mixedCount = countWorkingSets(mixedSets);
const mixedCounts = countsTowardStreak("bodyweight", mixedSets);
check("3 working sets", mixedCount === 3, `got ${mixedCount}`);
check("DOES count toward streak", mixedCounts);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion: Strength sessions with 0 working sets don't count toward streaks.");
  console.log("Sessions with at least one working set (reps or timed) do count.");
  console.log("Yoga counts by type, breathing never counts.\n");
}
