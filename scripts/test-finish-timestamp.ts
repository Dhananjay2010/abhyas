#!/usr/bin/env tsx
/**
 * Test finishTimestamp helper for stale session duration correction.
 *
 *   npx tsx scripts/test-finish-timestamp.ts
 */

import { finishTimestamp } from "../src/lib/session/finish-timestamp";

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

console.log("\nTesting finishTimestamp helper\n");

// Test 1: Normal same-day finish uses current time
console.log("1. Same-day session within 3h uses now");
{
  const startedAt = "2026-10-24T14:00:00Z";
  const now = "2026-10-24T14:30:00Z"; // 30 minutes later
  const lastSetCompletedAt = "2026-10-24T14:25:00Z";
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });
  assertEquals(result, now, "Same-day finish returns now");
}

// Test 2: Stale past-day session with sets uses last set + buffer
console.log("\n2. Past-day stale session with sets uses last set + buffer");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const now = "2026-10-24T14:00:00Z"; // Next day
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should be lastSetCompletedAt + 90 seconds
  const expected = new Date("2026-10-23T14:25:00Z").getTime() + 90000;
  const actual = result ? new Date(result).getTime() : null;
  assertEquals(actual, expected, "Past-day stale uses last set + 90s buffer");
}

// Test 3: Stale session (>3h idle) same day uses last set + buffer
console.log("\n3. Same-day session >3h idle uses last set + buffer");
{
  const startedAt = "2026-10-24T10:00:00Z";
  const lastSetCompletedAt = "2026-10-24T10:20:00Z";
  const now = "2026-10-24T14:00:00Z"; // 4 hours later
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 60,
  });

  // Should be lastSetCompletedAt + 60 seconds
  const expected = new Date("2026-10-24T10:20:00Z").getTime() + 60000;
  const actual = result ? new Date(result).getTime() : null;
  assertEquals(actual, expected, "Same-day >3h idle uses last set + 60s buffer");
}

// Test 4: Stale session with no sets returns null
console.log("\n4. Stale session with no sets returns null");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const now = "2026-10-24T14:00:00Z";
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt: null,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });
  assertEquals(result, null, "Stale with no sets returns null");
}

// Test 5: Exactly at 3h cap uses now (not yet stale)
console.log("\n5. Exactly at 3h uses now (not stale)");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T14:00:00Z"; // Exactly 3 hours
  const lastSetCompletedAt = "2026-10-24T11:20:00Z";
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });
  assertEquals(result, now, "At 3h exactly uses now");
}

// Test 6: Just over 3h uses last set + buffer
console.log("\n6. Just over 3h uses last set + buffer");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T14:00:01Z"; // 3 hours + 1 second
  const lastSetCompletedAt = "2026-10-24T11:20:00Z";
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  const expected = new Date("2026-10-24T11:20:00Z").getTime() + 90000;
  const actual = result ? new Date(result).getTime() : null;
  assertEquals(actual, expected, "Just over 3h uses last set + buffer");
}

// Test 7: Uses default 60s buffer when plannedRestSeconds is null
console.log("\n7. Uses default 60s buffer when rest is null");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z";
  const now = "2026-10-24T14:00:00Z";
  const result = finishTimestamp({
    startedAt,
    lastSetCompletedAt,
    now,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: null,
  });

  const expected = new Date("2026-10-23T14:25:00Z").getTime() + 60000;
  const actual = result ? new Date(result).getTime() : null;
  assertEquals(actual, expected, "Null rest seconds uses default 60s");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All finish timestamp tests passed!");
