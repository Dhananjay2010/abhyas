#!/usr/bin/env tsx
/**
 * Unit tests for computeSessionDuration and formatDurationMinutes (item 9).
 * 
 * Tests duration computation logic:
 * - When duration_seconds is set, use it
 * - When NULL with sets, compute from started_at to last set's completed_at
 * - When NULL with no sets, show no duration
 * - Never show "0 min" for NULL duration
 */

import { computeSessionDuration, formatDurationMinutes } from "../src/lib/history/compute-duration";

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

// Test computeSessionDuration
test("stored duration_seconds is used when set", () => {
  const result = computeSessionDuration(1800, "2026-10-24T10:00:00Z", "2026-10-24T10:35:00Z");
  assertEqual(result, 1800, "Should use stored duration_seconds");
});

test("NULL duration with sets computes from started_at to last set", () => {
  // Started at 10:00, last set at 10:30 = 1800 seconds
  const result = computeSessionDuration(null, "2026-10-24T10:00:00Z", "2026-10-24T10:30:00Z");
  assertEqual(result, 1800, "Should compute 1800 seconds (30 min)");
});

test("NULL duration with no sets returns null", () => {
  const result = computeSessionDuration(null, "2026-10-24T10:00:00Z", null);
  assertEqual(result, null, "Should return null when no sets");
});

test("NULL started_at returns null", () => {
  const result = computeSessionDuration(null, null, "2026-10-24T10:30:00Z");
  assertEqual(result, null, "Should return null when started_at is null");
});

test("negative computed duration returns null", () => {
  // Last set before start (shouldn't happen, but handle it)
  const result = computeSessionDuration(null, "2026-10-24T10:30:00Z", "2026-10-24T10:00:00Z");
  assertEqual(result, null, "Should return null for negative duration");
});

// Test formatDurationMinutes
test("formatDurationMinutes handles normal duration", () => {
  const result = formatDurationMinutes(2700); // 45 min
  assertEqual(result, "45 min");
});

test("formatDurationMinutes shows <1 min for very short", () => {
  const result = formatDurationMinutes(30); // 30 seconds
  assertEqual(result, "<1 min");
});

test("formatDurationMinutes returns '—' for NULL (QA Bot 1 new LOW)", () => {
  const result = formatDurationMinutes(null);
  assertEqual(result, "—", "Should return '—' for NULL duration (legacy History rows)");
});

test("formatDurationMinutes returns null for 0 (not '0 min')", () => {
  const result = formatDurationMinutes(0);
  assertEqual(result, null, "Should return null for 0 duration, not '0 min'");
});

test("formatDurationMinutes handles 1 minute", () => {
  const result = formatDurationMinutes(60);
  assertEqual(result, "1 min");
});

test("formatDurationMinutes handles large duration", () => {
  const result = formatDurationMinutes(36000); // 600 min = 10 hours
  assertEqual(result, "600 min");
});

console.log("\ncomputeSessionDuration tests complete");
process.exit(exitCode);
