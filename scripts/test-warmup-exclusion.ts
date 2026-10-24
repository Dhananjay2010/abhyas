#!/usr/bin/env tsx
/**
 * Test that warm-up sets are correctly excluded from working set counts.
 *
 * Regression test for regression #2: if is_warmup_set is ignored, warm-up sets
 * would incorrectly count as working sets.
 *
 *   npx tsx scripts/test-warmup-exclusion.ts
 */

import { countWorkingSets } from "../src/lib/session/count-sets";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    failed++;
  }
}

console.log("\n🧪 Testing warm-up set exclusion\n");

console.log("1. Only warm-up sets: count should be 0");
{
  const sets = [
    { is_warmup_set: true, reps: 10, duration_seconds: null },
    { is_warmup_set: true, reps: 12, duration_seconds: null },
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 0, "Only warm-up sets must not count as working sets");
}

console.log("\n2. Mix of warm-up and working sets: only working sets count");
{
  const sets = [
    { is_warmup_set: true, reps: 8, duration_seconds: null },
    { is_warmup_set: false, reps: 10, duration_seconds: null },
    { is_warmup_set: false, reps: 10, duration_seconds: null },
    { is_warmup_set: true, reps: 6, duration_seconds: null },
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 2, "Must count only the 2 working sets, not the warm-ups");
}

console.log("\n3. Only working sets: all count");
{
  const sets = [
    { is_warmup_set: false, reps: 10, duration_seconds: null },
    { is_warmup_set: false, reps: 12, duration_seconds: null },
    { is_warmup_set: false, reps: 10, duration_seconds: null },
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 3, "All 3 working sets must count");
}

console.log("\n4. Warm-up with duration (timed exercise): still excluded");
{
  const sets = [
    { is_warmup_set: true, reps: null, duration_seconds: 30 },
    { is_warmup_set: false, reps: null, duration_seconds: 60 },
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 1, "Warm-up timed set must be excluded");
}

console.log("\n5. Empty sets array: count is 0");
{
  const sets: Array<{ is_warmup_set: boolean; reps: number | null; duration_seconds: number | null }> = [];
  const count = countWorkingSets(sets);
  assertEquals(count, 0, "Empty array must return 0");
}

console.log("\n6. Working set with null is_warmup_set treated as non-warmup (safety)");
{
  const sets = [
    { is_warmup_set: null, reps: 10, duration_seconds: null },
    { is_warmup_set: false, reps: 12, duration_seconds: null },
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 2, "null is_warmup_set is treated as working set for safety");
}

console.log("\n7. Working sets must have logged data (reps or duration)");
{
  const sets = [
    { is_warmup_set: false, reps: null, duration_seconds: null }, // No data
    { is_warmup_set: false, reps: 10, duration_seconds: null }, // Has data
    { is_warmup_set: false, reps: null, duration_seconds: 45 }, // Has data
  ];
  const count = countWorkingSets(sets);
  assertEquals(count, 2, "Only working sets with logged data count");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All warm-up exclusion tests passed!");
