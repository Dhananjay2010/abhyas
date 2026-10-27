#!/usr/bin/env tsx
/**
 * Test isStaleSession helper.
 *
 *   npx tsx scripts/test-is-stale-session.ts
 */

import { isStaleSession } from "../src/lib/session/is-stale-session";

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

console.log("\nTesting isStaleSession helper\n");

// Test 1: Past day in Asia/Kolkata
console.log("1. Past day in Asia/Kolkata is stale");
{
  const startedAt = "2026-10-23T14:00:00Z"; // Oct 23
  const now = "2026-10-24T14:00:00Z"; // Oct 24 (next day)

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "Asia/Kolkata",
  });

  assertEquals(result, true, "Past day is stale");
}

// Test 2: Exactly 3 hours is NOT stale
console.log("\n2. Exactly 3 hours is NOT stale");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T14:00:00Z"; // Exactly 3 hours later

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, false, "At 3h exactly is not stale");
}

// Test 3: Just over 3 hours IS stale
console.log("\n3. Just over 3 hours is stale");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T14:00:01Z"; // 3 hours + 1 second

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, true, "Over 3h is stale");
}

// Test 4: Same day under 3 hours is NOT stale
console.log("\n4. Same day under 3 hours is NOT stale");
{
  const startedAt = "2026-10-24T14:00:00Z";
  const now = "2026-10-24T14:30:00Z"; // 30 minutes later

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, false, "Same day under 3h is not stale");
}

// Test 5: Just under 3 hours, same day
console.log("\n5. Just under 3 hours, same day");
{
  const startedAt = "2026-10-24T11:00:00Z";
  const now = "2026-10-24T13:59:59Z"; // 2h 59m 59s

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, false, "Under 3h is not stale");
}

// Test 6: Past day even if under 3 hours elapsed
console.log("\n6. Past day even if under 3 hours elapsed");
{
  const startedAt = "2026-10-23T23:00:00Z"; // 11 PM
  const now = "2026-10-24T00:30:00Z"; // 12:30 AM next day (1.5 hours later)

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, true, "Past day is stale even if <3h elapsed");
}

// Test 7: Same calendar day but >3h is stale
console.log("\n7. Same calendar day but >3h is stale");
{
  const startedAt = "2026-10-24T08:00:00Z";
  const now = "2026-10-24T16:00:00Z"; // 8 hours later, same day

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "UTC",
  });

  assertEquals(result, true, "Same day >3h is stale");
}

// Test 8: Timezone boundary - past day in local time
console.log("\n8. Timezone boundary - past day in Asia/Kolkata");
{
  // Started at 11:30 PM IST on Oct 23
  const startedAt = "2026-10-23T18:00:00Z"; // 11:30 PM IST (UTC+5:30)
  // Now is 12:30 AM IST on Oct 24
  const now = "2026-10-23T19:00:00Z"; // 12:30 AM IST next day (only 1 hour later in UTC)

  const result = isStaleSession({
    startedAt,
    now,
    timezone: "Asia/Kolkata",
  });

  assertEquals(result, true, "Past day in local timezone is stale");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All isStaleSession tests passed!");
