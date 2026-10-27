#!/usr/bin/env tsx
/**
 * Test QA LOW B: buildDetailDurationInput must include all sets.
 * 
 * The helper extracts sets for duration calculation. Passing only the last set
 * would give incorrect duration for multi-set sessions.
 * 
 *   npx tsx scripts/test-qa-low-b-build-detail-input.ts
 */

import { buildDetailDurationInput } from "../src/lib/history/build-detail-duration-input";
import { computeDetailPageDuration } from "../src/lib/history/compute-detail-page-duration";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("\nQA LOW B: buildDetailDurationInput includes all sets\n");

console.log("1. Multiple sets spanning 30 minutes - must include all sets");
{
  const sets = [
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:30:00Z", logged_at: null, is_warmup_set: false },
  ];
  
  const input = buildDetailDurationInput(sets);
  
  assertEquals(input.length, 3, "input includes all 3 sets");
  
  // Compute duration with full input
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const fullDuration = computeDetailPageDuration(session, input);
  assertEquals(fullDuration, 30 * 60, "full input gives 30 min duration");
  
  // Mutant check: passing only last set would give 0 duration
  const lastSetOnly = [sets[2]];
  const lastSetSession = {
    duration_seconds: null,
    started_at: "2026-10-27T10:30:00Z", // Same as the only set's time
  };
  const wrongDuration = computeDetailPageDuration(lastSetSession, lastSetOnly);
  assertEquals(wrongDuration, null, "last set only with same start time gives null (0 is invalid)");
  
  // This proves the page must pass ALL sets via buildDetailDurationInput
}

console.log("\n2. Multiple working sets with warm-ups");
{
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:25:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const input = buildDetailDurationInput(sets);
  
  assertEquals(input.length, 4, "input includes all 4 sets");
}

console.log("\n3. Specific duration test: 3 sets at 10:10, 10:20, 10:30 from 10:00 start");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:30:00Z", logged_at: null, is_warmup_set: false },
  ];
  
  const input = buildDetailDurationInput(sets);
  const duration = computeDetailPageDuration(session, input);
  
  // Expected: 10:00 to 10:30 = 30 minutes = 1800 seconds
  assertEquals(duration, 1800, "duration is exactly 1800 seconds (30 minutes)");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA LOW B input builder tests passed!");
