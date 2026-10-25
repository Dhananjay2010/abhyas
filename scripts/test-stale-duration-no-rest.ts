#!/usr/bin/env tsx
/**
 * Test backward compatibility: resolveStaleFinish without restSeconds (main's behavior).
 *
 *   npx tsx scripts/test-stale-duration-no-rest.ts
 */

import { resolveStaleFinishExtended as resolveStaleFinish } from "../src/lib/session/stale-duration";

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

console.log("\nTesting resolveStaleFinish backward compatibility (no restSeconds)\n");

// Test 1: Without restSeconds, ends at last set time (main's behavior)
console.log("1. Without restSeconds, ends at last set time (no rest added)");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
    // restSeconds not passed (undefined)
  });

  assertEquals(result.status, "completed", "Status is completed");
  const endMs = new Date(result.endedAt).getTime();
  const lastSetMs = new Date(lastSetCompletedAt).getTime();
  assertEquals(endMs, lastSetMs, "ended_at equals last set time (no rest added)");
  
  const expectedDuration = Math.floor((new Date(lastSetCompletedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  assertEquals(result.durationSeconds, expectedDuration, "Duration is from start to last set (25 minutes)");
}

// Test 2: With restSeconds explicitly passed, adds rest interval
console.log("\n2. With restSeconds=90, adds rest interval");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
    restSeconds: 90,
  });

  assertEquals(result.status, "completed", "Status is completed");
  
  const expectedEnd = new Date(new Date(lastSetCompletedAt).getTime() + 90 * 1000).toISOString();
  assertEquals(result.endedAt, expectedEnd, "ended_at is last set + 90s");
  
  const expectedDuration = Math.floor((new Date(lastSetCompletedAt).getTime() - new Date(startedAt).getTime() + 90 * 1000) / 1000);
  assertEquals(result.durationSeconds, expectedDuration, "Duration includes 90s rest");
}

// Test 3: No sets logged, without restSeconds
console.log("\n3. No sets logged, without restSeconds");
{
  const startedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: null,
    workingSetCount: 0,
    // restSeconds not passed
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertEquals(result.endedAt, startedAt, "ended_at equals started_at");
}

// Test 4: Null startedAt handled gracefully
console.log("\n4. Null startedAt handled gracefully");
{
  const result = resolveStaleFinish({
    startedAt: null,
    lastSetCompletedAt: null,
    workingSetCount: 0,
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertTrue(result.endedAt.length > 0, "ended_at is a valid timestamp");
}

// Test 5: Invalid startedAt handled gracefully
console.log("\n5. Invalid startedAt handled gracefully");
{
  const result = resolveStaleFinish({
    startedAt: "invalid-timestamp",
    lastSetCompletedAt: null,
    workingSetCount: 0,
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertTrue(result.endedAt.length > 0, "ended_at is a valid timestamp");
}

// Test 6: Invalid lastSetCompletedAt with valid startedAt
console.log("\n6. Invalid lastSetCompletedAt handled gracefully");
{
  const startedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: "not-a-date",
    workingSetCount: 1,
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertTrue((result.durationSeconds ?? 0) >= 0, "Duration is non-negative");
  assertTrue(result.endedAt.length > 0, "ended_at is a valid timestamp");
}

// Test 7: restSeconds=null uses 300s default
console.log("\n7. restSeconds=null uses 300s default");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:10:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
    restSeconds: null,
  });

  assertEquals(result.status, "completed", "Status is completed");
  
  const expectedEnd = new Date(new Date(lastSetCompletedAt).getTime() + 300 * 1000).toISOString();
  assertEquals(result.endedAt, expectedEnd, "ended_at is last set + 300s (default)");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All backward compatibility tests passed!");
