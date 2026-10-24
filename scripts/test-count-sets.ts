/**
 * Test countWorkingSets helper with mixed reps and timed sets.
 * 
 * Ensures both History list and detail pages count the same sets.
 * 
 *   npx tsx scripts/test-count-sets.ts
 */

import { countWorkingSets, type SetForCounting } from "../src/lib/session/count-sets";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting countWorkingSets with mixed reps and timed sets\n");

// Test 1: All reps-based sets
console.log("1. Reps-based sets only");
const repsSets: SetForCounting[] = [
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 8, duration_seconds: null },
];
const repsCount = countWorkingSets(repsSets);
check("3 reps sets = 3 working sets", repsCount === 3, `got ${repsCount}`);

// Test 2: All timed sets
console.log("\n2. Timed sets only");
const timedSets: SetForCounting[] = [
  { is_warmup_set: false, reps: null, duration_seconds: 30 },
  { is_warmup_set: false, reps: null, duration_seconds: 45 },
];
const timedCount = countWorkingSets(timedSets);
check("2 timed sets = 2 working sets", timedCount === 2, `got ${timedCount}`);

// Test 3: Mixed reps and timed (QA bug scenario)
console.log("\n3. Mixed: 6 reps sets + 2 timed holds (QA bug scenario)");
const mixedSets: SetForCounting[] = [
  // Push-Up Wide: 2 sets
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  // Pike Push-Up: 2 sets
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  // Isometric Wipers: 2 timed sets
  { is_warmup_set: false, reps: null, duration_seconds: 19 },
  { is_warmup_set: false, reps: null, duration_seconds: 45 },
  // Standing Towel Triceps Extension: 2 sets
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
];
const mixedCount = countWorkingSets(mixedSets);
check("6 reps + 2 timed = 8 working sets", mixedCount === 8, `got ${mixedCount}`);

// Test 4: Warmup sets excluded
console.log("\n4. Warmup sets excluded");
const withWarmups: SetForCounting[] = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: 8, duration_seconds: null },
];
const withWarmupsCount = countWorkingSets(withWarmups);
check("2 warmups + 3 working = 3 counted", withWarmupsCount === 3, `got ${withWarmupsCount}`);

// Test 5: Zero/null values excluded
console.log("\n5. Zero/null values excluded");
const withZeros: SetForCounting[] = [
  { is_warmup_set: false, reps: 0, duration_seconds: null },
  { is_warmup_set: false, reps: null, duration_seconds: 0 },
  { is_warmup_set: false, reps: null, duration_seconds: null },
  { is_warmup_set: false, reps: 10, duration_seconds: null },
  { is_warmup_set: false, reps: null, duration_seconds: 30 },
];
const withZerosCount = countWorkingSets(withZeros);
check("3 empty + 2 logged = 2 counted", withZerosCount === 2, `got ${withZerosCount}`);

// Test 6: Empty array
console.log("\n6. Edge cases");
const emptyCount = countWorkingSets([]);
check("empty array = 0", emptyCount === 0, `got ${emptyCount}`);

// Test 7: All warmups
const allWarmups: SetForCounting[] = [
  { is_warmup_set: true, reps: 5, duration_seconds: null },
  { is_warmup_set: true, reps: 8, duration_seconds: null },
];
const allWarmupsCount = countWorkingSets(allWarmups);
check("all warmups = 0", allWarmupsCount === 0, `got ${allWarmupsCount}`);

// Test 8: Null warmup flag (treat as working set for safety)
const nullWarmup: SetForCounting[] = [
  { is_warmup_set: null, reps: 10, duration_seconds: null },
];
const nullWarmupCount = countWorkingSets(nullWarmup);
check("null warmup flag with reps = 1 (counts)", nullWarmupCount === 1, `got ${nullWarmupCount}`);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion: countWorkingSets correctly counts both reps-based and timed sets,");
  console.log("excluding only warmups. List and detail pages now use the same logic.\n");
}
