#!/usr/bin/env tsx
/**
 * Unit test for midnight-crossing session edit (change 5).
 * 
 * Tests that 23:30 to 00:30 in Asia/Kolkata timezone:
 * - Gives a 3600s (1 hour) duration
 * - Passes server validation in edit-cores.ts
 * 
 * Also tests that start == end gives the correct error message.
 */

import { updateSessionDateTimeCore } from "../src/lib/history/edit-cores";
import { validateSessionTimes } from "../src/lib/history/validate-session-times";
import { zonedDateTimeToUtc, utcToZonedDateTime } from "../src/lib/timezone";

let exitCode = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error((err as Error).message);
      exitCode = 1;
    }
  })();
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

(async () => {
  // Test the validation helper
  await test("23:30 to 00:30 gives 3600s duration", () => {
    const result = validateSessionTimes("2026-10-24", "23:30", "00:30");
    
    if (!result.success) {
      throw new Error(`Expected success, got error: ${result.error}`);
    }
    
    assertEqual(result.durationSeconds, 3600, "Duration should be 3600 seconds");
    assertEqual(result.endDate, "2026-10-25", "End date should be next day");
  });

  await test("start == end gives correct error", () => {
    const result = validateSessionTimes("2026-10-24", "10:00", "10:00");
    
    if (result.success) {
      throw new Error("Expected validation to fail for start == end");
    }
    
    assertEqual(
      result.error,
      "End time must be different from start time",
      "Should return correct error message"
    );
  });

  await test("over 10 hours gives correct error", () => {
    const result = validateSessionTimes("2026-10-24", "10:00", "21:00");
    
    // This is same day, 11 hours
    if (result.success) {
      throw new Error("Expected validation to fail for 11-hour session");
    }
    
    if (!result.error.includes("10 hours")) {
      throw new Error(`Expected duration error, got: ${result.error}`);
    }
  });

  // Test the timezone conversion logic
  await test("23:30 to 00:30 calculates next-day timestamp correctly", () => {
    const startDate = "2026-10-24";
    const endDate = "2026-10-25"; // Next day
    const startTime = "23:30";
    const endTime = "00:30";
    const timezone = "Asia/Kolkata";

    const startedAt = zonedDateTimeToUtc(startDate, startTime, timezone);
    const completedAt = zonedDateTimeToUtc(endDate, endTime, timezone);

    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(completedAt).getTime();
    const durationSeconds = Math.round((endMs - startMs) / 1000);

    assertEqual(durationSeconds, 3600, "Duration should be 3600 seconds (1 hour)");
  });

  // Test that the server validation accepts this
  await test("Midnight-crossing session passes server validation", async () => {
  const startDate = "2026-10-24";
  const endDate = "2026-10-25";
  const startTime = "23:30";
  const endTime = "00:30";
  const timezone = "Asia/Kolkata";

  const startedAt = zonedDateTimeToUtc(startDate, startTime, timezone);
  const completedAt = zonedDateTimeToUtc(endDate, endTime, timezone);

  // Extract local_date from started_at in member's timezone
  const localDate = utcToZonedDateTime(startedAt, timezone).date;

  // Mock supabase client that returns no overlapping sessions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockSupabase: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: () => ({
              not: () => ({
                not: () => Promise.resolve({ data: [], error: null })
              })
            })
          })
        })
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [{ id: 'test-session-id' }], error: null })
          })
        })
      })
    })
  };

  const signupDate = "2026-01-01T00:00:00Z";
  const result = await updateSessionDateTimeCore(
    mockSupabase,
    "test-user-id",
    "test-session-id",
    localDate,
    startedAt,
    completedAt,
    timezone,
    signupDate
  );

  if (!result.success) {
    throw new Error(`Validation failed: ${result.error}`);
  }
});

// Test that duration > 10 hours is still rejected
await test("Sessions longer than 10 hours are rejected", async () => {
  const startDate = "2026-10-24";
  const endDate = "2026-10-25";
  const startTime = "10:00";
  const endTime = "21:00"; // 11 hours later on next day
  const timezone = "Asia/Kolkata";

  const startedAt = zonedDateTimeToUtc(startDate, startTime, timezone);
  const completedAt = zonedDateTimeToUtc(endDate, endTime, timezone);

  const localDate = utcToZonedDateTime(startedAt, timezone).date;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockSupabase: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: () => ({
              not: () => ({
                not: () => Promise.resolve({ data: [], error: null })
              })
            })
          })
        })
      })
    })
  };

  const signupDate = "2026-01-01T00:00:00Z";
  const result = await updateSessionDateTimeCore(
    mockSupabase,
    "test-user-id",
    "test-session-id",
    localDate,
    startedAt,
    completedAt,
    timezone,
    signupDate
  );

  if (result.success) {
    throw new Error("Expected validation to fail for 11-hour session");
  }

  if (!result.error?.includes("10 hours")) {
    throw new Error(`Expected duration error, got: ${result.error}`);
  }
});

  console.log("\nMidnight-crossing edit tests complete");
  process.exit(exitCode);
})();
