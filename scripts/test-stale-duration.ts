#!/usr/bin/env tsx
/**
 * Test resolveStaleFinish helper.
 *
 *   npx tsx scripts/test-stale-duration.ts
 */

import { resolveStaleFinish } from "../src/lib/session/stale-duration";

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

console.log("\nTesting resolveStaleFinish helper\n");

// Test 1: Normal case with working sets and last set
console.log("1. Normal stale finish with working sets");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z"; // 25 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertEquals(result.durationSeconds, 1500, "Duration is 25 minutes (1500s)");
  // Normalize timestamps for comparison (both to milliseconds)
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(lastSetCompletedAt).getTime(),
    "Ended at last set time"
  );
}

// Test 2: Warm-up only (0 working sets) gives skipped
console.log("\n2. Warm-up only (0 working sets) gives skipped");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:05:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 0,
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(startedAt).getTime(),
    "Ended at start time"
  );
}

// Test 3: Null last set with working sets (shouldn't happen but handle it)
console.log("\n3. Null last set with working sets");
{
  const startedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: null,
    workingSetCount: 1,
  });

  assertEquals(result.status, "completed", "Status is completed (has working sets)");
  assertEquals(result.durationSeconds, 0, "Duration is 0 (no sets logged)");
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(startedAt).getTime(),
    "Ended at start time"
  );
}

// Test 4: Last set before start is clamped to start
console.log("\n4. Last set before start is clamped");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T13:55:00Z"; // 5 minutes BEFORE start (invalid)

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertEquals(result.durationSeconds, 0, "Duration is 0 (clamped to start)");
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(startedAt).getTime(),
    "Ended at start time (clamped)"
  );
}

// Test 5: Exactly at start time
console.log("\n5. Last set exactly at start time");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(startedAt).getTime(),
    "Ended at start time"
  );
}

// Test 6: Long training session (2 hours)
console.log("\n6. Long training session");
{
  const startedAt = "2026-10-23T10:00:00Z";
  const lastSetCompletedAt = "2026-10-23T12:00:00Z"; // 2 hours later

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 20,
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertEquals(result.durationSeconds, 7200, "Duration is 2 hours (7200s)");
  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(lastSetCompletedAt).getTime(),
    "Ended at last set time"
  );
}

// Test 7: No working sets and null last set
console.log("\n7. No working sets and null last set");
{
  const startedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: null,
    workingSetCount: 0,
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertEquals(result.endedAt, startedAt, "Ended at start time");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All stale duration tests passed!");
