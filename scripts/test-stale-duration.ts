#!/usr/bin/env tsx
/**
 * Test resolveStaleFinish helper with rest interval logic.
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

console.log("\nTesting resolveStaleFinish helper\n");

// Test 1: Sets logged, ended_at = last_set + rest (default 300s)
console.log("1. Sets logged with null rest uses default 300s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z"; // 25 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
    restSeconds: null,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:25 + 5min) - 14:00 = 30 minutes = 1800s
  assertEquals(result.durationSeconds, 1800, "Duration is 30 minutes (25m + 5m rest)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 300 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 300s"
  );
}

// Test 2: No sets logged, ended_at = started_at, duration = 0
console.log("\n2. No sets logged gives skipped with 0 duration");
{
  const startedAt = "2026-10-23T14:00:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt: null,
    workingSetCount: 0,
    restSeconds: 90,
  });

  assertEquals(result.status, "skipped", "Status is skipped");
  assertEquals(result.durationSeconds, 0, "Duration is 0");
  assertEquals(result.endedAt, startedAt, "Ended at start time");
}

// Test 3: Planned rest = 120s
console.log("\n3. Planned rest = 120s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:20:00Z"; // 20 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
    restSeconds: 120,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:20 + 2min) - 14:00 = 22 minutes = 1320s
  assertEquals(result.durationSeconds, 1320, "Duration is 22 minutes (20m + 2m rest)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 120 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 120s"
  );
}

// Test 4: Planned rest = 0s
console.log("\n4. Planned rest = 0s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:15:00Z"; // 15 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
    restSeconds: 0,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:15 + 0s) - 14:00 = 15 minutes = 900s
  assertEquals(result.durationSeconds, 900, "Duration is 15 minutes (no rest)");

  assertEquals(
    new Date(result.endedAt).getTime(),
    new Date(lastSetCompletedAt).getTime(),
    "Ended at last set (no rest added)"
  );
}

// Test 5: Planned rest = 900s (15min) clamped to 300s
console.log("\n5. Planned rest = 900s clamped to 300s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:10:00Z"; // 10 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 3,
    restSeconds: 900,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:10 + 5min capped) - 14:00 = 15 minutes = 900s
  assertEquals(result.durationSeconds, 900, "Duration is 15 minutes (10m + 5m capped rest)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 300 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 300s (capped from 900s)"
  );
}

// Test 6: Negative rest clamped to 0 (e3)
console.log("\n6. Negative rest clamped to 0");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:08:00Z"; // 8 minutes after start

  // Test with -1 (should clamp to 0)
  const resultNegative = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
    restSeconds: -1,
  });
  
  // Test with 0 (should stay 0)
  const resultZero = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
    restSeconds: 0,
  });
  
  // Critical: -1 and 0 must produce IDENTICAL results (both clamped to 0)
  assertEquals(resultNegative.durationSeconds, resultZero.durationSeconds, "Negative rest gives same duration as 0 rest");
  assertEquals(
    new Date(resultNegative.endedAt).getTime(),
    new Date(resultZero.endedAt).getTime(),
    "Negative rest gives same endedAt as 0 rest (both clamped to 0)"
  );
  
  // Verify 0.5s rest works correctly (not clamped to 0)
  const resultHalfSecond = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
    restSeconds: 0.5,
  });
  const expectedEndMsHalf = new Date(lastSetCompletedAt).getTime() + 500;
  assertEquals(
    new Date(resultHalfSecond.endedAt).getTime(),
    expectedEndMsHalf,
    "0.5s rest is honored (not clamped to 0)"
  );
  
  // Verify duration is correct for 0.5s
  assertEquals(resultHalfSecond.durationSeconds, 480, "Duration with 0.5s rest is 480s (8min rounded)");
}

// Test 7: Missing restSeconds (undefined) ends at last set (backward compatibility)
console.log("\n7. Missing restSeconds ends at last set (main's behavior)");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:12:00Z"; // 12 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 2,
    // restSeconds omitted (undefined) - main's behavior
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: 14:12 - 14:00 = 12 minutes = 720s (no rest added)
  assertEquals(result.durationSeconds, 720, "Duration is 12 minutes (no rest added, main's behavior)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime();
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set (no rest, main's behavior)"
  );
}

// Test 8: ended_at never before last_set.completed_at (guard test)
console.log("\n8. ended_at never before last_set.completed_at");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:30:00Z"; // 30 minutes after start

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
    restSeconds: 0, // Even with 0 rest, ended_at should not be before last set
  });

  assertEquals(result.status, "completed", "Status is completed");
  assertEquals(
    new Date(result.endedAt).getTime() >= new Date(lastSetCompletedAt).getTime(),
    true,
    "ended_at is not before last_set.completed_at"
  );
}

// Test 9: Long training session (8 hours spanning sets) - NO 6-hour cap
console.log("\n9. Long past-day session: never 6-hour cap (regression test #87)");
{
  const startedAt = "2026-10-23T10:00:00Z";
  const lastSetCompletedAt = "2026-10-23T18:00:00Z"; // 8 hours later

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 20,
    restSeconds: 180, // 3 minutes rest
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (18:00 + 3min) - 10:00 = 8h 3min = 28980s
  assertEquals(result.durationSeconds, 28980, "Duration is 8h 3min (28980s), no 6h cap");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 180 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 180s"
  );
}

// Test 10: NaN rest uses default 300s
console.log("\n10. NaN rest uses default 300s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:05:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
    restSeconds: NaN,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:05 + 5min) - 14:00 = 10 minutes = 600s
  assertEquals(result.durationSeconds, 600, "Duration is 10 minutes (NaN becomes 300s)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 300 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 300s (NaN handled)"
  );
}

// Test 11: Infinity rest uses default 300s
console.log("\n11. Infinity rest uses default 300s");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:07:00Z";

  const result = resolveStaleFinish({
    startedAt,
    lastSetCompletedAt,
    workingSetCount: 1,
    restSeconds: Infinity,
  });

  assertEquals(result.status, "completed", "Status is completed");
  // Duration: (14:07 + 5min) - 14:00 = 12 minutes = 720s
  assertEquals(result.durationSeconds, 720, "Duration is 12 minutes (Infinity becomes 300s)");

  const expectedEndMs = new Date(lastSetCompletedAt).getTime() + 300 * 1000;
  assertEquals(
    new Date(result.endedAt).getTime(),
    expectedEndMs,
    "Ended at last set + 300s (Infinity handled)"
  );
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All stale duration tests passed!");
