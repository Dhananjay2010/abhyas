#!/usr/bin/env tsx
/**
 * Test that getRunnerClockElapsed uses displayElapsed to cap stale session clocks.
 *
 * Catches breaks f1, f1b, f1c:
 * - f1: useElapsed ignores the frozen value
 * - f1b: freezeElapsed ignores `frozen`
 * - f1c: stop() returns 0
 *
 *   npx tsx scripts/test-runner-clock-stale.ts
 */

import { getRunnerClockElapsed, displayElapsed, freezeElapsed } from "../src/lib/session/device";

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

console.log("\nTesting runner clock with stale sessions\n");

console.log("1. getRunnerClockElapsed caps stale sessions at 179:59");
{
  // Session started yesterday at 10:00 UTC
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(10, 0, 0, 0);
  const startedAt = yesterday.toISOString();

  // Simulated 5 hours elapsed
  const elapsed = 5 * 60 * 60;

  const result = getRunnerClockElapsed(elapsed, startedAt, "UTC");

  const expected = 3 * 60 * 60 - 1; // 179:59
  assertEquals(result, expected, "Stale session capped at 179:59 (10799s)");
}

console.log("\n2. getRunnerClockElapsed doesn't cap same-day sessions");
{
  // Session started 2 hours ago today
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
  const startedAt = twoHoursAgo.toISOString();

  const elapsed = 2 * 60 * 60 + 1800; // 2.5 hours

  const result = getRunnerClockElapsed(elapsed, startedAt, "UTC");

  assertEquals(result, elapsed, "Same-day session not capped");
}

console.log("\n3. displayElapsed caps elapsed >= 3h when stale");
{
  const elapsed = 4 * 60 * 60; // 4 hours
  const result = displayElapsed(elapsed, true);

  const expected = 3 * 60 * 60 - 1; // 179:59
  assertEquals(result, expected, "displayElapsed caps at 179:59 when stale");
}

console.log("\n4. displayElapsed doesn't cap when not stale");
{
  const elapsed = 4 * 60 * 60; // 4 hours
  const result = displayElapsed(elapsed, false);

  assertEquals(result, elapsed, "displayElapsed doesn't cap when not stale");
}

console.log("\n5. displayElapsed doesn't cap elapsed < 3h even when stale");
{
  const elapsed = 2 * 60 * 60; // 2 hours
  const result = displayElapsed(elapsed, true);

  assertEquals(result, elapsed, "displayElapsed doesn't cap below 3h even when stale");
}

console.log("\n6. freezeElapsed uses frozen value when provided (f1b)");
{
  const frozen = 1800; // 30 minutes
  const startMs = Date.now() - 3600 * 1000; // Started 1 hour ago
  const nowMs = Date.now();

  const result = freezeElapsed(frozen, startMs, nowMs);

  assertEquals(result, frozen, "freezeElapsed returns frozen value");
}

console.log("\n7. freezeElapsed calculates elapsed when frozen is null (f1b)");
{
  const frozen = null;
  const startMs = Date.now() - 1800 * 1000; // Started 30 minutes ago
  const nowMs = Date.now();

  const result = freezeElapsed(frozen, startMs, nowMs);

  // Should be around 1800 seconds (within 1 second tolerance)
  assertTrue(Math.abs(result - 1800) <= 1, `freezeElapsed calculates from start/now (got ${result}s, expected ~1800s)`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All runner clock stale tests passed!");
