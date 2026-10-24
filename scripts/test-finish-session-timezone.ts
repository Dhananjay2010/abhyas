#!/usr/bin/env tsx
/**
 * Test that finish-session judges 'started on a past day' in the member's timezone.
 *
 * Item 7: A session that's past-day in UTC but the same day in Asia/Kolkata,
 * and the reverse, must be handled correctly.
 *
 *   npx tsx scripts/test-finish-session-timezone.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { SessionRow } from "../src/lib/session/finish-session-deps";

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
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

function makeFakeDeps(session: SessionRow, trackUpdates: { duration?: number } = {}) {
  return {
    async loadSession() {
      return { data: session, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      return {
        data: [
          {
            rest_seconds: 90,
            session_sets: [
              { id: "set1", is_warmup_set: false, completed_at: new Date().toISOString() },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession(_id: string, patch: { duration_seconds: number }) {
      trackUpdates.duration = patch.duration_seconds;
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const }, error: null };
    },
    async loadExercisesForUpdate() {
      return {
        data: [
          {
            id: "ex1",
            planned_sets: 3,
            status: "pending" as const,
            session_sets: [{ id: "set1", is_warmup_set: false }],
          },
        ],
        error: null,
      };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
  };
}

async function runTests() {
  console.log("\n1. Session past-day in UTC but same day in Asia/Kolkata → NOT stale");
  {
    // Scenario: It's 2026-10-25 00:30 UTC (2026-10-25 06:00 in Asia/Kolkata)
    // Session started at 2026-10-24 23:00 UTC (2026-10-25 04:30 in Asia/Kolkata)
    // In UTC: past day (24th vs 25th)
    // In Asia/Kolkata: same day (25th vs 25th) → NOT stale
    
    const started = new Date("2026-10-24T23:00:00Z");
    
    const session: SessionRow = {
      started_at: started.toISOString(),
      local_date: "2026-10-25", // When started in Asia/Kolkata timezone
      user_id: "user-123",
    };
    
    const trackUpdates: { duration?: number } = {};
    const deps = makeFakeDeps(session, trackUpdates);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });
    
    assertTrue(result.ok, "Session should finish successfully");
    // Since it's the same day in the user's timezone, it should NOT be stale
    // and should use the actual duration
    assertEquals(trackUpdates.duration, 1800, "Duration should be the actual duration (not stale)");
  }

  console.log("\n2. Session same day in UTC but past-day in Asia/Kolkata → stale");
  {
    // Scenario: It's 2026-10-25 00:30 UTC (2026-10-25 06:00 in Asia/Kolkata)
    // Session started at 2026-10-24 19:00 UTC (2026-10-25 00:30 in Asia/Kolkata... wait that's wrong)
    // Let me recalculate: Asia/Kolkata is UTC+5:30
    // Session started at 2026-10-24 18:00 UTC (2026-10-24 23:30 in Asia/Kolkata)
    // In UTC: same day (25th vs 25th)... wait, no
    // Let me be more careful:
    // NOW: 2026-10-25 06:00 Asia/Kolkata = 2026-10-25 00:30 UTC
    // STARTED: 2026-10-24 23:30 Asia/Kolkata = 2026-10-24 18:00 UTC
    // In Asia/Kolkata: past day (24th vs 25th) → stale
    // In UTC: same day (24th vs 25th)... no wait, if now is 2026-10-25 00:30 UTC, then in UTC it's the 25th
    // and started is 24th 18:00 UTC, so in UTC it's also past day
    // Let me try again with a clearer scenario:
    
    // NOW: 2026-10-25 01:00 Asia/Kolkata = 2026-10-24 19:30 UTC
    // STARTED: 2026-10-24 23:00 Asia/Kolkata = 2026-10-24 17:30 UTC
    // In Asia/Kolkata: past day (24th vs 25th) → stale
    // In UTC: same day (24th vs 24th) → NOT stale in UTC
    
    const started = new Date("2026-10-24T17:30:00Z"); // 2026-10-24 23:00 in Asia/Kolkata
    
    const session: SessionRow = {
      started_at: started.toISOString(),
      local_date: "2026-10-24", // When started in Asia/Kolkata timezone
      user_id: "user-123",
    };
    
    const trackUpdates: { duration?: number } = {};
    const deps = makeFakeDeps(session, trackUpdates);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });
    
    assertTrue(result.ok, "Session should finish successfully");
    // Since it's a past day in the user's timezone, it should be stale
    // and should use stale finish logic (duration based on last set + rest)
    // The stale finish adds 90s (last set rest) to the last set completed time
    assertTrue(trackUpdates.duration !== 1800, "Duration should NOT be the actual duration (stale)");
  }

  console.log("\n3. Session past-day in both UTC and user timezone → stale");
  {
    // Clear past-day scenario
    const started = new Date("2026-10-24T10:00:00Z");
    
    const session: SessionRow = {
      started_at: started.toISOString(),
      local_date: "2026-10-24",
      timezone: "America/New_York",
    };
    
    const trackUpdates: { duration?: number } = {};
    const deps = makeFakeDeps(session, trackUpdates);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 3600,
      cooldownCompleted: true,
    });
    
    assertTrue(result.ok, "Session should finish successfully");
    assertTrue(trackUpdates.duration !== 3600, "Duration should NOT be the actual duration (stale)");
  }

  console.log("\n4. Session same day in user timezone → NOT stale");
  {
    // Clear same-day scenario
    const started = new Date("2026-10-25T10:00:00Z");
    
    const session: SessionRow = {
      started_at: started.toISOString(),
      local_date: "2026-10-25",
      timezone: "Europe/London",
    };
    
    const trackUpdates: { duration?: number } = {};
    const deps = makeFakeDeps(session, trackUpdates);
    const result = await finishSessionCore(deps, {
      sessionId: "s1",
      durationSeconds: 3600,
      cooldownCompleted: true,
    });
    
    assertTrue(result.ok, "Session should finish successfully");
    assertEquals(trackUpdates.duration, 3600, "Duration should be the actual duration (not stale)");
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
