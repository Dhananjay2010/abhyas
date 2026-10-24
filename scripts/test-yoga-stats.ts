#!/usr/bin/env tsx
/**
 * Unit tests for computeYogaStats (QA M-4).
 * 
 * Tests that yoga/breathing stats are computed correctly
 * from completed sessions using local dates.
 */

import { computeYogaStats } from "../src/lib/progress/yoga-stats";

let exitCode = 0;

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

// Test data: sessions this week (Mon 20 Oct - today 24 Oct)
const sessions = [
  { local_date: "2026-10-20", duration_seconds: 1800 }, // Mon (30 min)
  { local_date: "2026-10-22", duration_seconds: 1200 }, // Wed (20 min)
  { local_date: "2026-10-24", duration_seconds: 600 },  // Fri (10 min)
  { local_date: "2026-10-15", duration_seconds: 1800 }, // Last week (30 min)
  { local_date: "2026-10-01", duration_seconds: 1200 }, // Early Oct (20 min)
];

test("sessions this week (Mon-Fri)", () => {
  const stats = computeYogaStats(sessions, "2026-10-24");
  assertEqual(stats.sessionsThisWeek, 3);
});

test("minutes this week", () => {
  const stats = computeYogaStats(sessions, "2026-10-24");
  // 1800 + 1200 + 600 = 3600 seconds = 60 minutes
  assertEqual(stats.minutesThisWeek, 60);
});

test("minutes this month", () => {
  const stats = computeYogaStats(sessions, "2026-10-24");
  // All October sessions: 1800 + 1200 + 600 + 1800 + 1200 = 6600 seconds = 110 minutes
  assertEqual(stats.minutesThisMonth, 110);
});

test("sessions all time", () => {
  const stats = computeYogaStats(sessions, "2026-10-24");
  assertEqual(stats.sessionsAllTime, 5);
});

test("empty sessions array", () => {
  const stats = computeYogaStats([], "2026-10-24");
  assertEqual(stats.sessionsThisWeek, 0);
  assertEqual(stats.minutesThisWeek, 0);
  assertEqual(stats.minutesThisMonth, 0);
  assertEqual(stats.sessionsAllTime, 0);
});

test("Sunday counted correctly (end of week)", () => {
  const sundaySessions = [
    { local_date: "2026-10-26", duration_seconds: 1800 }, // Sun (this week)
  ];
  const stats = computeYogaStats(sundaySessions, "2026-10-26");
  assertEqual(stats.sessionsThisWeek, 1);
});

test("null duration_seconds treated as 0", () => {
  const nullDurationSessions = [
    { local_date: "2026-10-24", duration_seconds: null },
    { local_date: "2026-10-24", duration_seconds: 600 },
  ];
  const stats = computeYogaStats(nullDurationSessions, "2026-10-24");
  assertEqual(stats.minutesThisWeek, 10); // Only 600 seconds counted
});

console.log("\ncomputeYogaStats tests complete");
process.exit(exitCode);
