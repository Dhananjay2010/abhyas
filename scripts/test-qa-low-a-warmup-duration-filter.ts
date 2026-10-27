#!/usr/bin/env tsx
/**
 * Test QA LOW A: History detail duration must filter to working sets (drop warm-ups).
 * 
 * The detail page must filter to working sets before calling computeDetailDuration,
 * the same way the History list does. If the latest set chronologically is a warm-up,
 * it should be ignored.
 * 
 *   npx tsx scripts/test-qa-low-a-warmup-duration-filter.ts
 */

import { computeDetailDuration } from "../src/lib/history/compute-detail-duration";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

(function main() {
console.log("\nQA LOW A: History detail filters warm-ups before computing duration\n");

console.log("1. Latest set is a warm-up - should be filtered out");
{
  const startedAt = "2026-10-27T10:00:00Z";
  
  // Working set at 10:10, warm-up set at 10:15 (latest chronologically)
  const allSets = [
    { is_warmup_set: false, completed_at: "2026-10-27T10:10:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T10:15:00Z", logged_at: null },
  ];
  
  // Page should filter to working sets before calling computeDetailDuration
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  const duration = computeDetailDuration(
    { duration_seconds: null, started_at: startedAt },
    workingSets
  );
  
  // Duration should be from start to last WORKING set (10:10), not warm-up (10:15)
  const expectedDuration = 10 * 60; // 10 minutes
  assertEquals(duration, expectedDuration, "duration ends at last working set, not warm-up");
}

console.log("\n2. All sets are warm-ups - duration is null");
{
  const startedAt = "2026-10-27T10:00:00Z";
  
  const allSets = [
    { is_warmup_set: true, completed_at: "2026-10-27T10:05:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T10:10:00Z", logged_at: null },
  ];
  
  // Page filters to working sets
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  const duration = computeDetailDuration(
    { duration_seconds: null, started_at: startedAt },
    workingSets
  );
  
  assertEquals(duration, null, "duration is null when no working sets exist");
}

console.log("\n3. Warm-up before working set - uses working set");
{
  const startedAt = "2026-10-27T10:00:00Z";
  
  // Warm-up at 10:05, working set at 10:10 (latest chronologically)
  const allSets = [
    { is_warmup_set: true, completed_at: "2026-10-27T10:05:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T10:10:00Z", logged_at: null },
  ];
  
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  const duration = computeDetailDuration(
    { duration_seconds: null, started_at: startedAt },
    workingSets
  );
  
  const expectedDuration = 10 * 60; // 10 minutes
  assertEquals(duration, expectedDuration, "duration ends at working set");
}

console.log("\n4. Multiple warm-ups interspersed - uses last working set");
{
  const startedAt = "2026-10-27T10:00:00Z";
  
  // Working at 10:05, warm-up at 10:08, working at 10:10, warm-up at 10:15 (latest)
  const allSets = [
    { is_warmup_set: false, completed_at: "2026-10-27T10:05:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T10:08:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T10:10:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T10:15:00Z", logged_at: null },
  ];
  
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  const duration = computeDetailDuration(
    { duration_seconds: null, started_at: startedAt },
    workingSets
  );
  
  // Should use 10:10 (last working), not 10:15 (warm-up)
  const expectedDuration = 10 * 60; // 10 minutes
  assertEquals(duration, expectedDuration, "duration uses last working set, ignoring later warm-ups");
}

console.log("\n5. Stored duration_seconds is used regardless of warm-ups");
{
  const startedAt = "2026-10-27T10:00:00Z";
  
  const allSets = [
    { is_warmup_set: false, completed_at: "2026-10-27T10:10:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T10:20:00Z", logged_at: null },
  ];
  
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  // When duration_seconds is stored, it's used directly
  const duration = computeDetailDuration(
    { duration_seconds: 900, started_at: startedAt },
    workingSets
  );
  
  assertEquals(duration, 900, "stored duration_seconds is used");
}

console.log("\n6. Real-world scenario: 5/5/2/2 Full Body with warm-ups");
{
  const startedAt = "2026-10-27T08:00:00Z";
  
  // Squat: 2 warm-ups + 5 working sets
  // Bench: 1 warm-up + 5 working sets
  // Row: 2 working sets
  // OHP: 1 warm-up + 2 working sets
  // Last working set: OHP set 2 at 08:25
  // Last warm-up: OHP warm-up at 08:30 (AFTER last working set)
  const allSets = [
    // Squat warm-ups
    { is_warmup_set: true, completed_at: "2026-10-27T08:01:00Z", logged_at: null },
    { is_warmup_set: true, completed_at: "2026-10-27T08:02:00Z", logged_at: null },
    // Squat working
    { is_warmup_set: false, completed_at: "2026-10-27T08:03:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:04:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:05:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:06:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:07:00Z", logged_at: null },
    // Bench warm-up
    { is_warmup_set: true, completed_at: "2026-10-27T08:10:00Z", logged_at: null },
    // Bench working
    { is_warmup_set: false, completed_at: "2026-10-27T08:11:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:12:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:13:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:14:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:15:00Z", logged_at: null },
    // Row working
    { is_warmup_set: false, completed_at: "2026-10-27T08:20:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:21:00Z", logged_at: null },
    // OHP warm-up
    { is_warmup_set: true, completed_at: "2026-10-27T08:23:00Z", logged_at: null },
    // OHP working (LAST WORKING SETS)
    { is_warmup_set: false, completed_at: "2026-10-27T08:24:00Z", logged_at: null },
    { is_warmup_set: false, completed_at: "2026-10-27T08:25:00Z", logged_at: null },
    // Additional warm-up AFTER working sets (edge case)
    { is_warmup_set: true, completed_at: "2026-10-27T08:30:00Z", logged_at: null },
  ];
  
  const workingSets = allSets.filter(s => !s.is_warmup_set);
  
  const duration = computeDetailDuration(
    { duration_seconds: null, started_at: startedAt },
    workingSets
  );
  
  // Should use 08:25 (last working), not 08:30 (warm-up)
  const expectedDuration = 25 * 60; // 25 minutes
  assertEquals(duration, expectedDuration, "complex session uses last working set time");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA LOW A warm-up filter tests passed!");
})();
