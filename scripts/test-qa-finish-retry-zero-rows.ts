#!/usr/bin/env tsx
/**
 * Test QA: Finish retry matching 0 rows leaves exercise and session statuses unchanged.
 * 
 * When finishSession is called but the update matches 0 rows (session was already finished),
 * the function re-reads the stored status and returns it. It must NOT update exercise statuses
 * in this case, as the session was already finished by another call.
 * 
 *   npx tsx scripts/test-qa-finish-retry-zero-rows.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";

const NOW = "2026-10-27T12:00:00Z";
const ONE_HOUR_AGO = new Date(Date.parse(NOW) - 60 * 60 * 1000).toISOString();

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

(async function main() {
console.log("\nQA: Finish retry matching 0 rows leaves statuses unchanged\n");

console.log("1. Update matches 0 rows - exercise statuses NOT updated");
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
            status: "pending" as const, // Exercise is pending, not completed yet
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
            status: "completed" as const, // Already completed
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
    now: () => NOW,
  };

  const result = await finishSessionCore(deps, {
    sessionId: "session-1",
    durationSeconds: 1800,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession succeeds");
  if (result.ok) {
    assertEquals(result.data.status, "completed", "returns stored status");
    assertEquals(result.data.durationSeconds, 1800, "returns stored duration");
  }
  
  // The key assertion: exercise statuses should NOT be updated
  // loadExercisesForUpdate is called but updateExerciseStatus should not be
  assertEquals(exerciseStatusUpdates, 0, "exercise statuses NOT updated when 0 rows matched");
}

console.log("\n2. First call updates, second call matches 0 rows");
{
  let updateCalls = 0;
  let exerciseStatusUpdates = 0;
  let sessionStatus: "in_progress" | "completed" = "in_progress";
  let exerciseStatus: "pending" | "completed" = "pending";
  
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
            status: exerciseStatus, // Track exercise status
          },
        ],
        error: null,
      };
    },
    async updateSession() {
      updateCalls++;
      if (updateCalls === 1) {
        // First call succeeds
        sessionStatus = "completed";
        return { error: null, updatedCount: 1 };
      }
      // Second call matches 0 rows
      return { error: null, updatedCount: 0 };
    },
    async loadSessionStatus() {
      return {
        data: { status: sessionStatus, duration_seconds: 1800 },
        error: null,
      };
    },
    async loadExercisesForUpdate() {
      return {
        data: [
          {
            id: "ex1",
            planned_sets: 3,
            status: exerciseStatus,
            session_sets: [{ id: "set1", is_warmup_set: false }],
          },
        ],
        error: null,
      };
    },
    async updateExerciseStatus() {
      exerciseStatusUpdates++;
      exerciseStatus = "completed";
      return { error: null };
    },
    now: () => NOW,
  };

  // First call
  const result1 = await finishSessionCore(deps, {
    sessionId: "session-1",
    durationSeconds: 1800,
    cooldownCompleted: true,
  });

  assertTrue(result1.ok, "first call succeeds");
  assertEquals(updateCalls, 1, "first call updated session");
  assertEquals(exerciseStatusUpdates, 1, "first call updated exercise status");
  assertEquals(sessionStatus, "completed", "session is completed");
  assertEquals(exerciseStatus, "completed", "exercise is completed");

  // Second call (concurrent retry)
  const result2 = await finishSessionCore(deps, {
    sessionId: "session-1",
    durationSeconds: 1800,
    cooldownCompleted: true,
  });

  assertTrue(result2.ok, "second call succeeds");
  assertEquals(updateCalls, 2, "second call attempted update");
  assertEquals(exerciseStatusUpdates, 1, "second call did NOT update exercise status");
  assertEquals(sessionStatus, "completed", "session still completed");
  assertEquals(exerciseStatus, "completed", "exercise still completed (unchanged)");
}

console.log("\n3. Multiple exercises - statuses unchanged on 0-row update");
{
  let exerciseStatusUpdates = 0;
  const updatedExercises: string[] = [];
  
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
            status: "pending" as const, // Exercise is pending
          },
          {
            rest_seconds: null,
            session_sets: [
              { id: "set2", is_warmup_set: false, completed_at: NOW },
            ],
            status: "pending" as const, // Exercise is pending
          },
        ],
        error: null,
      };
    },
    async updateSession() {
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
          { id: "ex1", planned_sets: 3, status: "completed" as const, session_sets: [{ id: "set1", is_warmup_set: false }] },
          { id: "ex2", planned_sets: 3, status: "completed" as const, session_sets: [{ id: "set2", is_warmup_set: false }] },
          { id: "ex3", planned_sets: 3, status: "skipped" as const, session_sets: [] },
        ],
        error: null,
      };
    },
    async updateExerciseStatus(id) {
      exerciseStatusUpdates++;
      updatedExercises.push(id);
      return { error: null };
    },
    now: () => NOW,
  };

  const result = await finishSessionCore(deps, {
    sessionId: "session-1",
    durationSeconds: 1800,
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession succeeds");
  assertEquals(exerciseStatusUpdates, 0, "no exercise statuses updated");
  assertEquals(updatedExercises.length, 0, "no exercises were touched");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All QA finish retry zero-row tests passed!");
})();
