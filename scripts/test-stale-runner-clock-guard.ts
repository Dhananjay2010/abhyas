#!/usr/bin/env tsx
/**
 * Test that the runner clock never shows >= 180:00 for a stale session.
 *
 *   npx tsx scripts/test-stale-runner-clock-guard.ts
 */

import { formatClock, displayElapsed } from "../src/lib/session/device";
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

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\nTesting stale runner clock guard\n");

  const THREE_HOURS_SECONDS = 3 * 60 * 60; // 10800 seconds = 180:00

  console.log("1. Fresh session (< 3 hours): displayElapsed returns actual elapsed");
  {
    // Use a fixed "now" time in the middle of the day to avoid day boundary issues
    const now = new Date("2026-10-25T12:00:00Z").toISOString();
    const startedAt = new Date("2026-10-25T10:30:00Z").toISOString(); // 90 min before now
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt, now, timezone });
    assertEquals(stale, false, "Session is not stale");

    const elapsed = Math.floor((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000);
    const display = displayElapsed(elapsed, stale);
    
    assertEquals(display, elapsed, "displayElapsed returns actual elapsed for non-stale");
    assertTrue(display < THREE_HOURS_SECONDS, "Display < 3 hours");
    
    const clockText = formatClock(display);
    assertTrue(clockText.startsWith("90:") || clockText.startsWith("91:"), "Clock shows ~90 minutes");
  }

  console.log("\n2. Stale session (past day): displayElapsed caps at 179:59");
  {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startedAt = yesterday.toISOString();
    const now = new Date().toISOString();
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt, now, timezone });
    assertEquals(stale, true, "Session is stale (past day)");

    const actualElapsed = Math.floor((Date.now() - yesterday.getTime()) / 1000);
    assertTrue(actualElapsed >= THREE_HOURS_SECONDS, "Actual elapsed >= 3 hours");

    const display = displayElapsed(actualElapsed, stale);
    const clockText = formatClock(display);

    assertEquals(display, THREE_HOURS_SECONDS - 1, "displayElapsed capped at 179:59");
    assertEquals(clockText, "179:59", "Clock shows 179:59");
  }

  console.log("\n3. Stale session (> 3 hours idle same day): displayElapsed caps at 179:59");
  {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt: fourHoursAgo, now, timezone });
    assertEquals(stale, true, "Session is stale (> 3 hours)");

    const actualElapsed = Math.floor((Date.now() - new Date(fourHoursAgo).getTime()) / 1000);
    assertTrue(actualElapsed >= THREE_HOURS_SECONDS, "Actual elapsed >= 3 hours");

    const display = displayElapsed(actualElapsed, stale);
    const clockText = formatClock(display);

    assertEquals(display, THREE_HOURS_SECONDS - 1, "displayElapsed capped at 179:59");
    assertEquals(clockText, "179:59", "Clock shows 179:59");
  }

  console.log("\n4. displayElapsed edge cases");
  {
    // Exactly 3 hours, stale
    const threeHours = 3 * 60 * 60;
    assertEquals(displayElapsed(threeHours, true), threeHours - 1, "Exactly 3h stale → 179:59");
    
    // Just under 3 hours, stale
    assertEquals(displayElapsed(threeHours - 1, true), threeHours - 1, "179:59 stale → 179:59");
    
    // Just under 3 hours, not stale
    assertEquals(displayElapsed(threeHours - 1, false), threeHours - 1, "179:59 non-stale → 179:59");
    
    // Way over 3 hours, stale
    const fiveHours = 5 * 60 * 60;
    assertEquals(displayElapsed(fiveHours, true), threeHours - 1, "5h stale → 179:59");
  }

  console.log("\n5. formatClock function test: various times");
  {
    assertEquals(formatClock(0), "0:00", "0 seconds");
    assertEquals(formatClock(59), "0:59", "59 seconds");
    assertEquals(formatClock(60), "1:00", "1 minute");
    assertEquals(formatClock(3599), "59:59", "59:59");
    assertEquals(formatClock(3600), "60:00", "1 hour");
    assertEquals(formatClock(10799), "179:59", "179:59");
    assertEquals(formatClock(10800), "180:00", "180:00 (3 hours)");
    assertEquals(formatClock(14400), "240:00", "240:00 (4 hours)");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All stale runner clock guard tests passed!");
}

runTests();
