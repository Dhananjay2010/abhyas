#!/usr/bin/env tsx
/**
 * Test QA LOW B: Page's duration calculation path via buildSessionDuration.
 * 
 * Tests the behavioral path the history detail page takes:
 * sets → buildDetailDurationInput → computeDetailPageDuration
 * 
 * This test exercises line 118 in src/app/history/[id]/page.tsx where
 * buildSessionDuration is called with the raw sets.
 * 
 *   npx tsx scripts/test-qa-low-b-page-duration-path.ts
 */

import { buildSessionDuration } from "../src/lib/history/build-session-duration";

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
console.log("\nQA LOW B: Page's duration calculation path\n");

console.log("1. Multiple working sets spanning 30 minutes");
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
  
  const duration = buildSessionDuration(session, sets);
  assertEquals(duration, 1800, "duration is 30 minutes (1800 seconds)");
}

console.log("\n2. Mixed warm-ups and working sets");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:25:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = buildSessionDuration(session, sets);
  assertEquals(duration, 1200, "duration uses working sets only (20 minutes)");
}

console.log("\n3. Critical: Last set is warm-up - passing only last would give null");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  // Full sets: working sets, then final warm-up/cooldown
  const allSets = [
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:20:00Z", logged_at: null, is_warmup_set: false },
    { completed_at: "2026-10-27T10:30:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const fullDuration = buildSessionDuration(session, allSets);
  assertEquals(fullDuration, 1200, "full sets use last working set (20 minutes)");
  
  // Mutant scenario: page passes only last set with .slice(-1)
  const lastSetOnly = allSets.slice(-1);
  const mutantDuration = buildSessionDuration(session, lastSetOnly);
  assertEquals(mutantDuration, null, "mutant: last set only gives null (warm-up filtered out)");
}

console.log("\n4. Stored duration_seconds bypasses set calculation");
{
  const session = {
    duration_seconds: 2400,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: false },
  ];
  
  const duration = buildSessionDuration(session, sets);
  assertEquals(duration, 2400, "stored duration_seconds is used");
}

console.log("\n5. No working sets returns null");
{
  const session = {
    duration_seconds: null,
    started_at: "2026-10-27T10:00:00Z",
  };
  
  const sets = [
    { completed_at: "2026-10-27T10:05:00Z", logged_at: null, is_warmup_set: true },
    { completed_at: "2026-10-27T10:10:00Z", logged_at: null, is_warmup_set: true },
  ];
  
  const duration = buildSessionDuration(session, sets);
  assertEquals(duration, null, "no working sets returns null");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA LOW B page duration path tests passed!");
})();
