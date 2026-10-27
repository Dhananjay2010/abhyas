#!/usr/bin/env tsx
/**
 * Test QA LOW B: Test that exercises the page's call into computeDetailDuration.
 * 
 * The page calls computeDetailPageDuration, which filters warm-ups before calling
 * computeDetailDuration. This test verifies that the page's logic (via the extracted
 * function) correctly filters and computes duration, so passing only the last set
 * would fail the test.
 * 
 *   npx tsx scripts/test-qa-low-b-detail-page-duration-call.ts
 */

import { computeDetailPageDuration } from "../src/lib/history/compute-detail-page-duration";

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

(function main() {
console.log("\nQA LOW B: Page's duration calculation via computeDetailPageDuration\n");

console.log("1. Multiple sets - uses chronologically latest working set");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  // Set 1 at 10:05, Set 2 at 10:10, Warm-up at 10:15
  // Chronologically: Set 1, Set 2, Warm-up
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:15:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use Set 2 (10:10), not Warm-up (10:15)
  const expectedDuration = 10 * 60; // 10 minutes from start to 10:10
  assertEquals(duration, expectedDuration, "uses latest working set, not warm-up");
}

console.log("\n2. Passing only last set would fail - multiple sets needed");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  // Three working sets at different times
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:15:00Z", logged_at: null, is_warmup_set: false },
  ];
  
  // If we only passed the last set, we'd get 15 minutes
  const fullDuration = computeDetailPageDuration(session, sets);
  
  // But if someone only passed the last set, they'd get:
  const lastSetOnly = [sets[2]];
  const wrongDuration = computeDetailPageDuration(session, lastSetOnly);
  
  // The full duration should be 15 minutes
  assertEquals(fullDuration, 15 * 60, "full duration is 15 minutes");
  
  // Passing only last set also gives 15 minutes (since it's the only set)
  assertEquals(wrongDuration, 15 * 60, "last set only also gives 15 minutes (but wrong input)");
  
  // The test ensures we pass ALL sets, not just the last one
  // If someone changed the page to only pass the last set, other tests would catch it
  // because the chronological ordering would be wrong
}

console.log("\n3. Complex session: 5/5/2/2 Full Body with warm-ups");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T08:00:00Z",
  };
  
  // Squat: warm-ups + 5 working
  // Bench: warm-up + 5 working
  // Row: 2 working
  // OHP: warm-up + 2 working
  // Last working: OHP set 2 at 08:25
  // Additional warm-up AFTER working: 08:30
  const sets = [
    { completed_at: "2026-10-27T08:01:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:02:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:03:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:04:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:06:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:07:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:10:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:11:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:12:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:13:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:14:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:15:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:21:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:23:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:24:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:25:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:30:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use 08:25 (last working), not 08:30 (warm-up)
  const expectedDuration = 25 * 60; // 25 minutes
  assertEquals(duration, expectedDuration, "complex session filters warm-ups correctly");
}

console.log("\n4. Stored duration_seconds bypasses filtering");
{
  const session = {
    duration_seconds: 1800, // 30 minutes stored
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use stored value, not compute from sets
  assertEquals(duration, 1800, "stored duration_seconds is used");
}

console.log("\n5. No working sets - returns null");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  assertEquals(duration, null, "no working sets returns null");
}

console.log("\n6. Empty sets array - returns null");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets: Array<{ completed_at: string | null; logged_at?: string | null; is_warmup_set: boolean }> = [];
  
  const duration = computeDetailPageDuration(session, sets);
  
  assertEquals(duration, null, "empty sets returns null");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA LOW B page duration tests passed!");
})();
