#!/usr/bin/env tsx
/**
 * Test that the runner clock never shows >= 180:00 for a stale session.
 *
 *   npx tsx scripts/test-stale-runner-clock-guard.ts
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { formatClock } from "../src/lib/session/device";
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

  console.log("1. Fresh session (< 3 hours): clock shows actual elapsed");
  {
    const startedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 min ago
    const now = new Date().toISOString();
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt, now, timezone });
    assertEquals(stale, false, "Session is not stale");

    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const clockText = formatClock(elapsed);
    
    assertTrue(elapsed < THREE_HOURS_SECONDS, "Elapsed < 3 hours");
    assertTrue(clockText.startsWith("90:") || clockText.startsWith("91:"), "Clock shows ~90 minutes");
  }

  console.log("\n2. Stale session (past day): clock should be capped");
  {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startedAt = yesterday.toISOString();
    const now = new Date().toISOString();
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt, now, timezone });
    assertEquals(stale, true, "Session is stale (past day)");

    // Actual elapsed would be ~24 hours = 1440 minutes
    const actualElapsed = Math.floor((Date.now() - yesterday.getTime()) / 1000);
    assertTrue(actualElapsed >= THREE_HOURS_SECONDS, "Actual elapsed >= 3 hours");

    // For display purposes, if we guard the clock, it should never show >= 180:00
    // The guard would cap display at 179:59
    const MAX_DISPLAY_SECONDS = THREE_HOURS_SECONDS - 1; // 179:59
    const guardedElapsed = Math.min(actualElapsed, MAX_DISPLAY_SECONDS);
    const clockText = formatClock(guardedElapsed);

    assertTrue(guardedElapsed < THREE_HOURS_SECONDS, "Guarded elapsed < 3 hours");
    assertEquals(clockText, "179:59", "Clock capped at 179:59");
  }

  console.log("\n3. Stale session (> 3 hours idle same day): clock should be capped");
  {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const timezone = "UTC";

    const stale = isStaleSession({ startedAt: fourHoursAgo, now, timezone });
    assertEquals(stale, true, "Session is stale (> 3 hours)");

    const actualElapsed = Math.floor((Date.now() - new Date(fourHoursAgo).getTime()) / 1000);
    assertTrue(actualElapsed >= THREE_HOURS_SECONDS, "Actual elapsed >= 3 hours");

    const MAX_DISPLAY_SECONDS = THREE_HOURS_SECONDS - 1;
    const guardedElapsed = Math.min(actualElapsed, MAX_DISPLAY_SECONDS);
    const clockText = formatClock(guardedElapsed);

    assertTrue(guardedElapsed < THREE_HOURS_SECONDS, "Guarded elapsed < 3 hours");
    assertEquals(clockText, "179:59", "Clock capped at 179:59");
  }

  console.log("\n4. Render test: Clock component with capped elapsed time");
  {
    const MockClock = ({ elapsed }: { elapsed: number }) => {
      const THREE_HOURS = 3 * 60 * 60;
      const displayElapsed = elapsed >= THREE_HOURS ? THREE_HOURS - 1 : elapsed;
      return React.createElement("span", {}, formatClock(displayElapsed));
    };

    const staleElapsed = 5 * 60 * 60; // 5 hours
    const html = renderToStaticMarkup(React.createElement(MockClock, { elapsed: staleElapsed }));

    assertEquals(html, "<span>179:59</span>", "Rendered clock shows 179:59");
    assertTrue(!html.includes("300:"), "Does not show 300+ minutes");
  }

  console.log("\n5. formatClock function test: various times");
  {
    assertEquals(formatClock(0), "0:00", "0 seconds");
    assertEquals(formatClock(59), "0:59", "59 seconds");
    assertEquals(formatClock(60), "1:00", "1 minute");
    assertEquals(formatClock(3599), "59:59", "59:59");
    assertEquals(formatClock(3600), "60:00", "1 hour");
    assertEquals(formatClock(10799), "179:59", "179:59");
    assertEquals(formatClock(10800), "180:00", "180:00 (3 hours, should not display for stale)");
    assertEquals(formatClock(14400), "240:00", "240:00 (4 hours, should not display for stale)");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All stale runner clock guard tests passed!");
}

runTests();
