#!/usr/bin/env tsx
/**
 * Test runnerClockSeconds for stale session clock guard.
 *
 *   npx tsx scripts/test-runner-clock.ts
 */

import { runnerClockSeconds } from "../src/lib/session/runner-clock";

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

console.log("\nTesting runnerClockSeconds helper\n");

// Test 1: Fresh session counts normally
console.log("1. Fresh session counts normally from started_at to now");
{
  const startedAt = "2026-10-24T14:00:00Z";
  const now = "2026-10-24T14:30:00Z"; // 30 minutes later
  const lastSetCompletedAt = "2026-10-24T14:25:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  // 30 minutes = 1800 seconds
  assertEquals(result, 1800, "Fresh session shows 30 minutes");
}

// Test 2: Past-day stale session caps at last set + buffer
console.log("\n2. Past-day stale session caps display");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:25:00Z"; // 25 minutes after start
  const now = "2026-10-24T14:00:00Z"; // 24 hours later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  // Should be: (14:25 - 14:00) + 90s = 25 minutes + 90s = 1590s
  assertEquals(result, 1590, "Past-day stale caps at last set + 90s");
  assertTrue(result < 10800, "Stale session never shows >= 3 hours");
}

// Test 3: Same-day >3h idle session caps at last set + buffer
console.log("\n3. Same-day session >3h idle caps display");
{
  const startedAt = "2026-10-24T10:00:00Z";
  const lastSetCompletedAt = "2026-10-24T10:20:00Z"; // 20 minutes after start
  const now = "2026-10-24T14:00:00Z"; // 4 hours later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 2,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 60,
  });

  // Should be: (10:20 - 10:00) + 60s = 20 minutes + 60s = 1260s
  assertEquals(result, 1260, "Same-day >3h caps at last set + 60s");
  assertTrue(result < 10800, "Stale session never shows >= 3 hours");
}

// Test 4: Stale session with no sets shows 0
console.log("\n4. Stale session with no sets shows 0");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const now = "2026-10-24T14:00:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt: null,
    workingSetCount: 0,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 90,
  });

  assertEquals(result, 0, "Stale with no sets shows 0");
}

// Test 5: Just under 3h counts normally
console.log("\n5. Just under 3h counts normally");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T13:59:59Z"; // 2h 59m 59s later
  const lastSetCompletedAt = "2026-10-24T11:20:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  // Should be full elapsed time: 10799 seconds
  assertEquals(result, 10799, "Just under 3h counts normally");
}

// Test 6: Just over 3h caps display
console.log("\n6. Just over 3h caps display");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const lastSetCompletedAt = "2026-10-24T11:20:00Z"; // 20 minutes after start
  const now = "2026-10-24T14:00:01Z"; // 3h + 1s later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 3,
    timezone: "UTC",
    sessionLocalDate: "2026-10-24",
    plannedRestSeconds: 90,
  });

  // Should cap at: 20 minutes + 90s = 1290s
  assertEquals(result, 1290, "Just over 3h caps at last set + buffer");
  assertTrue(result < 10800, "Capped value is < 3 hours");
}

// Test 7: Uses default 60s buffer when rest is null
console.log("\n7. Uses default 60s buffer");
{
  const startedAt = "2026-10-23T14:00:00Z";
  const lastSetCompletedAt = "2026-10-23T14:10:00Z"; // 10 minutes
  const now = "2026-10-24T14:00:00Z";

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 2,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: null,
  });

  // 10 minutes + 60s = 660s
  assertEquals(result, 660, "Null rest uses default 60s buffer");
}

// Test 8: Render constraint - stale session never >= 180 minutes
console.log("\n8. Render constraint: stale never >= 180 minutes (10800s)");
{
  // Even with a long session, stale cap keeps it under 180 minutes
  const startedAt = "2026-10-23T10:00:00Z";
  const lastSetCompletedAt = "2026-10-23T12:00:00Z"; // 2 hours of training
  const now = "2026-10-24T14:00:00Z"; // 28 hours later

  const result = runnerClockSeconds({
    startedAt,
    now,
    lastSetCompletedAt,
    workingSetCount: 20,
    timezone: "UTC",
    sessionLocalDate: "2026-10-23",
    plannedRestSeconds: 120,
  });

  // 2 hours + 120s = 7320s
  assertTrue(result < 10800, "Stale session display never shows >= 180 minutes");
  assertEquals(result, 7320, "Shows actual training duration (2h + 120s)");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All runner clock tests passed!");
