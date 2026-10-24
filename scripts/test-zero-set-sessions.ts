#!/usr/bin/env tsx
/**
 * Test zero-set strength session exclusion with AND logic.
 * 
 * Product rule (2026-10-24): Strength sessions count toward streaks/days trained
 * ONLY when status = 'completed' AND workingSetCount >= 1.
 * 
 * Two storage shapes must both be excluded:
 * 1. Legacy: status = 'completed' with 0 working sets
 * 2. New: status = 'skipped' (Dev 3's finishSession change)
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

// Test 1: countWorkingSets helper
console.log("1. countWorkingSets helper");
check("warmup-only = 0", countWorkingSets([{ is_warmup_set: true, reps: 10, duration_seconds: null }]) === 0);
check("no sets = 0", countWorkingSets([]) === 0);
check("1 working set = 1", countWorkingSets([{ is_warmup_set: false, reps: 5, duration_seconds: null }]) === 1);
check("timed hold counts", countWorkingSets([{ is_warmup_set: false, reps: null, duration_seconds: 60 }]) === 1);

// Test 2: Yoga always counts when completed
console.log("\n2. Yoga completed → counts");
check("yoga completed with 0 sets", countsTowardStreak("yoga", "completed", 0));
check("yoga completed with 1 set", countsTowardStreak("yoga", "completed", 1));
check("yoga completed without set count", countsTowardStreak("yoga", "completed", undefined));

// Test 3: Strength completed with working sets → counts
console.log("\n3. Strength completed + working sets → counts");
check("weights completed with 1 set", countsTowardStreak("weights", "completed", 1));
check("weights completed with 3 sets", countsTowardStreak("weights", "completed", 3));
check("bodyweight completed with 1 set", countsTowardStreak("bodyweight", "completed", 1));

// Test 4: Legacy shape - strength completed with 0 sets → does NOT count
console.log("\n4. Legacy: strength completed + 0 sets → does NOT count");
check("weights completed with 0 sets", !countsTowardStreak("weights", "completed", 0));
check("bodyweight completed with 0 sets", !countsTowardStreak("bodyweight", "completed", 0));

// Test 5: New shape - strength skipped → does NOT count
console.log("\n5. New: strength skipped → does NOT count");
check("weights skipped", !countsTowardStreak("weights", "skipped", 0));
check("weights skipped (even with set count)", !countsTowardStreak("weights", "skipped", 3));
check("bodyweight skipped", !countsTowardStreak("bodyweight", "skipped", 0));

// Test 6: Strength planned → does NOT count
console.log("\n6. Strength planned → does NOT count");
check("weights planned", !countsTowardStreak("weights", "planned", 0));
check("weights planned (even with set count)", !countsTowardStreak("weights", "planned", 3));

// Test 7: Strength completed without set count → does NOT count
console.log("\n7. Strength completed without set count → does NOT count");
check("weights completed, no set count", !countsTowardStreak("weights", "completed", undefined));
check("weights completed, null set count", !countsTowardStreak("weights", "completed", undefined));

// Test 8: Breathing never counts
console.log("\n8. Breathing never counts");
check("meditation completed", !countsTowardStreak("meditation", "completed", 0));
check("meditation completed with sets", !countsTowardStreak("meditation", "completed", 1));
check("rest completed", !countsTowardStreak("rest", "completed", 0));

// Test 9: Yoga skipped → does NOT count
console.log("\n9. Yoga skipped → does NOT count");
check("yoga skipped", !countsTowardStreak("yoga", "skipped", 0));
check("yoga planned", !countsTowardStreak("yoga", "planned", 0));

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion:");
  console.log("- Yoga: counts when status = 'completed' (set count not required)");
  console.log("- Strength: counts ONLY when status = 'completed' AND workingSetCount >= 1");
  console.log("- Legacy completed+0 sets: excluded ✓");
  console.log("- New skipped status: excluded ✓");
  console.log("- Breathing: never counts\n");
}
