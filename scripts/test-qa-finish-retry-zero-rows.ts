#!/usr/bin/env tsx
/**
 * Test QA: Finish retry matching 0 rows leaves statuses unchanged.
 * 
 * When finishSession update matches 0 rows (session already finished), exercise statuses
 * must NOT be updated. The zero-row guard at finish-session.ts:114 protects against
 * duplicate status updates.
 *
 *   npx tsx scripts/test-qa-finish-retry-zero-rows.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";

const NOW = "2026-10-25T12:00:00Z";
const NOW_MS = Date.parse(NOW);
const ONE_HOUR_AGO = new Date(NOW_MS - 60 * 60 * 1000).toISOString();
const NOW_FN = () => NOW;

let testsPassed = 0;
let testsFailed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log("\nQA: Finish retry matching 0 rows leaves statuses unchanged\n");

  console.log("1. Zero-row update - exercise statuses NOT updated");
  {
    let exerciseStatusUpdates = 0;
    
    const deps: FinishSessionDeps = {
      async loadSession() {
        return {
          data: {
            started_at: ONE_HOUR_AGO,
            local_date: NOW.split("T")[0],
            user_id: "user-123",
          },
          error: null,
        };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercises() {
        return {
          data: [
            {
              rest_seconds: null,
              session_sets: [
                { id: "set1", is_warmup_set: false, completed_at: NOW },
              ],
              status: "pending" as const,
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        // 0 rows updated - session was already finished
        return { error: null, updatedCount: 0 };
      },
      async loadSessionStatus() {
        return {
          data: { status: "completed" as const, duration_seconds: 1800 },
          error: null,
        };
      },
      async loadExercisesForUpdate() {
        return {
          data: [
            {
              id: "ex1",
              planned_sets: 3,
              status: "pending" as const, // Still pending (would trigger update without guard)
              session_sets: [{ id: "set1", is_warmup_set: false }],
            },
          ],
          error: null,
        };
      },
      async updateExerciseStatus() {
        exerciseStatusUpdates++;
        return { error: null };
      },
      now: NOW_FN,
    };

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result.ok, true, "finishSession succeeds");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "returns stored status");
      assertEquals(result.data.durationSeconds, 1800, "returns stored duration");
    }
    assertEquals(exerciseStatusUpdates, 0, "exercise statuses NOT updated when 0 rows matched");
  }

  console.log("\n2. First call updates (1 row), second call matches 0 rows");
  {
    let sessionUpdateCount = 0;
    let exerciseStatusUpdateCalls = 0;
    
    const deps: FinishSessionDeps = {
      async loadSession() {
        return {
          data: {
            started_at: ONE_HOUR_AGO,
            local_date: NOW.split("T")[0],
            user_id: "user-123",
          },
          error: null,
        };
      },
      async loadTimezone() {
        return { data: { timezone: "UTC" }, error: null };
      },
      async loadExercises() {
        return {
          data: [
            {
              rest_seconds: null,
              session_sets: [
                { id: "set1", is_warmup_set: false, completed_at: NOW },
              ],
              status: "pending" as const,
            },
          ],
          error: null,
        };
      },
      async updateSession() {
        sessionUpdateCount++;
        // First call updates, second call matches 0 rows
        return { error: null, updatedCount: sessionUpdateCount === 1 ? 1 : 0 };
      },
      async loadSessionStatus() {
        return {
          data: { status: "completed" as const, duration_seconds: 1800 },
          error: null,
        };
      },
      async loadExercisesForUpdate() {
        return {
          data: [
            {
              id: "ex1",
              planned_sets: 3,
              status: sessionUpdateCount === 1 ? ("pending" as const) : ("completed" as const),
              session_sets: [{ id: "set1", is_warmup_set: false }],
            },
          ],
          error: null,
        };
      },
      async updateExerciseStatus() {
        exerciseStatusUpdateCalls++;
        return { error: null };
      },
      now: NOW_FN,
    };

    // First call
    const result1 = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result1.ok, true, "first call succeeds");
    assertEquals(sessionUpdateCount, 1, "first call updated session");
    assertEquals(exerciseStatusUpdateCalls, 1, "first call updated exercise status");
    if (result1.ok) {
      assertEquals(result1.data.status, "completed", "session is completed");
    }

    // Second call (retry)
    const result2 = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result2.ok, true, "second call succeeds");
    assertEquals(sessionUpdateCount, 2, "second call attempted update");
    assertEquals(exerciseStatusUpdateCalls, 1, "second call did NOT update exercise status");
    if (result2.ok) {
      assertEquals(result2.data.status, "completed", "session still completed");
    }
  }

  console.log(`\n✅ Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }

  console.log("\n✨ All QA finish retry zero-row tests passed!");
}

runTests();
