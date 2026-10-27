#!/usr/bin/env tsx
/**
 * Test QA LOW A: History detail filters warm-ups before computing duration.
 * 
 * Tests that computeDetailPageDuration (the shipped function) correctly filters
 * warm-up sets before calculating duration.
 * 
 *   npx tsx scripts/test-qa-low-a-warmup-duration-filter.ts
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
console.log("\nQA LOW A: History detail filters warm-ups before computing duration\n");

console.log("1. Latest set is a warm-up - should use last working set");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: true },  // Latest but warm-up
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use 10:10 (last working), not 10:20 (warm-up)
  const expected = 10 * 60;
  assertEquals(duration, expected, "duration ends at last working set, not warm-up");
}

console.log("\n2. All sets are warm-ups - duration is null");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:15:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  assertEquals(duration, null, "duration is null when no working sets exist");
}

console.log("\n3. Warm-up before working set - uses working set");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:02:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use 10:10 (last working)
  const expected = 10 * 60;
  assertEquals(duration, expected, "duration ends at working set");
}

console.log("\n4. Multiple warm-ups interspersed - uses last working set");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:02:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:08:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:12:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:18:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use 10:12 (last working), ignoring later warm-ups
  const expected = 12 * 60;
  assertEquals(duration, expected, "duration uses last working set, ignoring later warm-ups");
}

console.log("\n5. Stored duration_seconds is used regardless of warm-ups");
{
  const session = {
    duration_seconds: 900, // 15 minutes stored
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:25:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  assertEquals(duration, 900, "stored duration_seconds is used");
}

console.log("\n6. Real-world scenario: 5/5/2/2 Full Body with warm-ups");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T08:00:00Z",
  };
  
  // Squat: 2 warm-up + 5 working
  // Bench: 1 warm-up + 5 working  
  // Row: 2 working
  // OHP: 1 warm-up + 2 working
  // Last working set at 08:40
  // Additional warm-up after at 08:45
  const sets = [
    { completed_at: "2026-10-27T08:02:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:04:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:05:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:07:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:09:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:11:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:13:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:16:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:18:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:22:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:24:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:26:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:30:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:32:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:36:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T08:38:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:40:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T08:45:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = computeDetailPageDuration(session, sets);
  
  // Should use 08:40 (last working), not 08:45 (warm-up)
  const expected = 40 * 60;
  assertEquals(duration, expected, "complex session uses last working set time");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA LOW A warm-up filter tests passed!");
})();
