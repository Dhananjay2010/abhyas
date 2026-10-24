#!/usr/bin/env tsx
/**
 * Unit tests for formatSessionDateTime (TZ-2).
 * 
 * Tests that session date/time formatting works correctly:
 * - Shows both date and time from started_at in the current zone
 * - Falls back to local_date when started_at is null
 * - Shows year when not current year
 */

import { formatSessionDateTime } from "../src/lib/history/format-session-datetime";

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

function assertContains(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(
      message || `Expected "${actual}" to contain "${expected}"`
    );
  }
}

function assertNotContains(actual: string, notExpected: string, message?: string) {
  if (actual.includes(notExpected)) {
    throw new Error(
      message || `Expected "${actual}" to NOT contain "${notExpected}"`
    );
  }
}

// Test cases
test("Auckland session viewed from Asia/Kolkata shows Kolkata time", () => {
  // Saturday 24 Oct 2026, 7:00 AM NZDT (Auckland) = Friday 23 Oct 2026, 11:30 PM IST (Kolkata)
  const aucklandTime = "2026-10-23T18:00:00.000Z"; // 7:00 AM in Auckland (UTC+13 DST)
  const result = formatSessionDateTime(aucklandTime, "2026-10-24", "Asia/Kolkata");
  
  // Should show Friday (not Saturday) and 11:30 pm (Kolkata time)
  assertContains(result, "Fri", "Should show Friday");
  assertContains(result, "Oct 23", "Should show Oct 23");
  assertContains(result, "11:30", "Should show 11:30");
  assertContains(result, "pm", "Should show pm");
});

test("cross-year date shows year", () => {
  // A session from 2025 viewed in 2026
  const oldSession = "2025-12-15T10:00:00.000Z";
  const result = formatSessionDateTime(oldSession, "2025-12-15", "UTC");
  
  assertContains(result, "2025", "Should show year for past year");
});

test("current year session doesn't show year", () => {
  // A session from the current year
  const currentYear = new Date().getFullYear();
  const currentYearSession = `${currentYear}-10-24T10:00:00.000Z`;
  const result = formatSessionDateTime(currentYearSession, `${currentYear}-10-24`, "UTC");
  
  assertNotContains(result, currentYear.toString(), "Should not show current year");
});

test("null started_at falls back to local_date", () => {
  const result = formatSessionDateTime(null, "2026-10-24", "UTC");
  
  // Should show date from local_date, no time
  assertContains(result, "Sat", "Should show weekday (2026-10-24 is Saturday)");
  assertContains(result, "24 Oct", "Should show date");
  assertNotContains(result, ":", "Should not show time when started_at is null");
});

test("null started_at with past year shows year", () => {
  const currentYear = new Date().getFullYear();
  const pastYear = currentYear - 1;
  const result = formatSessionDateTime(null, `${pastYear}-12-15`, "UTC");
  
  assertContains(result, pastYear.toString(), "Should show year for past year");
});

test("shows time with am/pm in lowercase", () => {
  const morningSession = "2026-10-24T09:30:00.000Z"; // 9:30 AM UTC
  const result = formatSessionDateTime(morningSession, "2026-10-24", "UTC");
  
  assertContains(result, "am", "Should show am in lowercase");
});

test("afternoon session shows pm", () => {
  const afternoonSession = "2026-10-24T14:30:00.000Z"; // 2:30 PM UTC
  const result = formatSessionDateTime(afternoonSession, "2026-10-24", "UTC");
  
  assertContains(result, "pm", "Should show pm in lowercase");
});

console.log("\nformatSessionDateTime tests complete");
process.exit(exitCode);
