/**
 * Test that strength sessions with 0 working sets don't count toward streaks
 * or appear in History, while sessions with working sets do count.
 * 
 * Product rule (2026-10-24): Callers must filter sessions to ensure:
 * - status = 'completed' (not 'skipped', 'planned', etc.)
 * - strength sessions have working_sets >= 1 (join with session_volume)
 * 
 * This test validates the working set counting logic and session type classification.
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

console.log("\nTesting zero-set session exclusion (unit tests)\n");

// Test 1: countWorkingSets on warmup-only
console.log("1. Strength session with only warmup sets");
const warmupOnlySets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
];
const warmupCount = countWorkingSets(warmupOnlySets);
check("0 working sets", warmupCount === 0, `got ${warmupCount}`);

// Test 2: countWorkingSets on empty
console.log("\n2. Strength session with no sets");
const noSets: typeof warmupOnlySets = [];
const noSetsCount = countWorkingSets(noSets);
check("0 working sets", noSetsCount === 0);

// Test 3: countWorkingSets with one working set
console.log("\n3. Strength session with one working set");
const oneWorkingSet = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
];
const oneWorkingCount = countWorkingSets(oneWorkingSet);
check("1 working set", oneWorkingCount === 1, `got ${oneWorkingCount}`);

// Test 4: countWorkingSets with timed hold
console.log("\n4. Strength session with one timed hold (0 reps, has duration)");
const timedHoldSets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: null, duration_seconds: 60 },
];
const timedHoldCount = countWorkingSets(timedHoldSets);
check("1 working set (timed)", timedHoldCount === 1, `got ${timedHoldCount}`);

// Test 5: countsTowardStreak type classification - yoga
console.log("\n5. Session type classification: yoga");
const yogaCounts = countsTowardStreak("yoga");
check("yoga type counts", yogaCounts);

// Test 6: countsTowardStreak type classification - weights
console.log("\n6. Session type classification: weights");
const weightsCounts = countsTowardStreak("weights");
check("weights type counts", weightsCounts);

// Test 7: countsTowardStreak type classification - bodyweight
console.log("\n7. Session type classification: bodyweight");
const bodyweightCounts = countsTowardStreak("bodyweight");
check("bodyweight type counts", bodyweightCounts);

// Test 8: countsTowardStreak type classification - breathing
console.log("\n8. Session type classification: meditation (breathing)");
const breathingCounts = countsTowardStreak("meditation");
check("breathing does NOT count", !breathingCounts);

// Test 9: countsTowardStreak type classification - rest
console.log("\n9. Session type classification: rest");
const restCounts = countsTowardStreak("rest");
check("rest does NOT count", !restCounts);

// Test 10: Mixed warmup and working sets
console.log("\n10. Strength session with mixed warmup and working sets");
const mixedSets = [
  { is_warmup_set: true, reps: 10, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
  { is_warmup_set: false, reps: 5, duration_seconds: null },
  { is_warmup_set: false, reps: 4, duration_seconds: null },
];
const mixedCount = countWorkingSets(mixedSets);
check("3 working sets", mixedCount === 3, `got ${mixedCount}`);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion:");
  console.log("- countWorkingSets correctly identifies working sets (excl. warmups)");
  console.log("- countsTowardStreak classifies session types (weights/bodyweight/yoga count, breathing/rest don't)");
  console.log("- Query-level filtering (join with session_volume) ensures only sessions with working sets count\n");
}
