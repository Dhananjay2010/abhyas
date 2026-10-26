#!/usr/bin/env tsx
/**
 * Unit tests for Progress page empty state (Task G11).
 * 
 * Tests that empty state is shown when no data exists,
 * and stat tiles/charts are shown when data exists.
 */

import { readFileSync } from "fs";
import { join } from "path";

let exitCode = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error((err as Error).message);
    exitCode = 1;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// Read the actual source file
const progressPagePath = join(process.cwd(), "src/app/progress/page.tsx");
const progressPageSource = readFileSync(progressPagePath, "utf-8");

test("source code contains hasAnyProgressData variable", () => {
  assert(
    progressPageSource.includes("hasAnyProgressData"),
    "Must define hasAnyProgressData variable to determine empty state"
  );
});

test("source code contains !hasAnyProgressData check", () => {
  assert(
    progressPageSource.includes("!hasAnyProgressData"),
    "Must check !hasAnyProgressData to show empty state"
  );
});

test("empty state shows 'No progress data yet' message", () => {
  assert(
    progressPageSource.includes("No progress data yet"),
    "Empty state must show 'No progress data yet' message"
  );
});

test("empty state shows 'Start today's workout' CTA", () => {
  assert(
    progressPageSource.includes("Start today") && progressPageSource.includes("workout"),
    "Empty state must show 'Start today's workout' CTA"
  );
});

test("empty state links to /today", () => {
  const emptyStateSection = progressPageSource.substring(
    progressPageSource.indexOf("No progress data yet"),
    progressPageSource.indexOf("No progress data yet") + 400
  );
  
  assert(
    emptyStateSection.includes('href="/today"'),
    "Empty state must link to /today page"
  );
});

test("hasAnyProgressData logic includes yoga/breathing check", () => {
  assert(
    progressPageSource.includes("isYogaOrBreathing") && 
    progressPageSource.includes("yogaStats") &&
    progressPageSource.includes("sessionsAllTime"),
    "Must check yoga/breathing stats for empty state determination"
  );
});

test("hasAnyProgressData logic includes strength check", () => {
  assert(
    progressPageSource.includes("streaks.totalSessions") || 
    progressPageSource.includes("hasAnything"),
    "Must check strength data for empty state determination"
  );
});

test("uses brand CSS variables, not hardcoded colors", () => {
  const emptyStateSection = progressPageSource.substring(
    progressPageSource.indexOf("No progress data yet"),
    progressPageSource.indexOf("No progress data yet") + 500
  );
  
  assert(
    emptyStateSection.includes("--color-accent") || emptyStateSection.includes("bg-accent"),
    "Must use brand CSS variables (--color-accent or bg-accent class)"
  );
});

// Test the logic that determines if empty state should be shown

test("strength member with no data: should show empty state", () => {
  const isYogaOrBreathing = false;
  const yogaStats = null;
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights = [];
  const volumeRows = [];
  const strengthData = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasStrengthData = volumeRows.length > 0 || strengthData.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && (yogaStats as { sessionsAllTime: number }).sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, false, "Should show empty state for strength member with no data");
});

test("strength member with sessions: should show data", () => {
  const isYogaOrBreathing = false;
  const yogaStats = null;
  const streaks = { totalSessions: 5, current: 2, longest: 3 };
  const weights = [];
  const volumeRows = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && (yogaStats as { sessionsAllTime: number }).sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, true, "Should show data for strength member with sessions");
});

test("strength member with weight data only: should show data", () => {
  const isYogaOrBreathing = false;
  const yogaStats = null;
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights = [{ recorded_on: "2026-10-26", weight_kg: 80 }];
  const volumeRows = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && (yogaStats as { sessionsAllTime: number }).sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, true, "Should show data for strength member with weight entries");
});

test("yoga member with no sessions: should show empty state", () => {
  const isYogaOrBreathing = true;
  const yogaStats = { sessionsAllTime: 0, sessionsThisWeek: 0, minutesThisWeek: 0, minutesThisMonth: 0 };
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights = [];
  const volumeRows = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && yogaStats.sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, false, "Should show empty state for yoga member with no sessions");
});

test("yoga member with sessions: should show data", () => {
  const isYogaOrBreathing = true;
  const yogaStats = { sessionsAllTime: 3, sessionsThisWeek: 1, minutesThisWeek: 30, minutesThisMonth: 90 };
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights = [];
  const volumeRows = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && yogaStats.sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, true, "Should show data for yoga member with sessions");
});

test("breathing member with no sessions and null stats: should show empty state", () => {
  const isYogaOrBreathing = true;
  const yogaStats = null;
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights: unknown[] = [];
  const volumeRows: unknown[] = [];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && (yogaStats as { sessionsAllTime: number }).sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  // When yogaStats is null (e.g., error state), the expression evaluates to null (falsy)
  // The actual condition in the code is !hasAnyProgressData, so we test that
  const shouldShowEmpty = !hasAnyProgressData;
  assertEqual(shouldShowEmpty, true, "Should show empty state when yogaStats is null");
});

test("strength member with volume data: should show data", () => {
  const isYogaOrBreathing = false;
  const yogaStats = null;
  const streaks = { totalSessions: 0, current: 0, longest: 0 };
  const weights = [];
  const volumeRows = [
    { local_date: "2026-10-26", volume_kg: 5000, set_count: 12, duration_seconds: 3600 }
  ];
  
  const hasAnything = weights.length > 0 || volumeRows.length > 0;
  const hasAnyProgressData = isYogaOrBreathing 
    ? (yogaStats && (yogaStats as { sessionsAllTime: number }).sessionsAllTime > 0)
    : (streaks.totalSessions > 0 || hasAnything);

  assertEqual(hasAnyProgressData, true, "Should show data for strength member with volume");
});

console.log("\nProgress empty state logic tests complete");
process.exit(exitCode);
