#!/usr/bin/env tsx
/**
 * Test L-2: close-stale and finish-session must add the same rest time.
 *
 * The runner adds 75s rest per set (the planned rest_seconds); the stale close-out
 * in close-stale.ts must add the same rest time so History durations are consistent.
 * 
 * This test verifies that both paths use the same rest time logic via resolveStaleFinishExtended.
 *
 *   npx tsx scripts/test-l2-close-stale-rest-consistency.ts
 */

import { closeStaleSessionsCore } from "../src/lib/session/close-stale";
import type { CloseStaleDeps, SessionExerciseRow } from "../src/lib/session/close-stale-deps";
import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps } from "../src/lib/session/finish-session-deps";

const NOW_MS = Date.parse("2026-10-27T12:00:00Z");
const NOW = new Date(NOW_MS).toISOString();
const STALE_TIME = new Date(NOW_MS - 7 * 60 * 60 * 1000).toISOString(); // 7 hours ago
const REST_SECONDS = 90;

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
console.log("\nL-2: close-stale and finish-session add the same rest time\n");

// Scenario: Session with one working set, rest_seconds = 90
const LAST_SET_TIME = new Date(Date.parse(STALE_TIME) + 10 * 60 * 1000).toISOString(); // 10 min after start

console.log("1. close-stale adds rest_seconds to duration");
{
  const updateCalls: Array<{ id: string; status: string; completed_at: string; duration_seconds: number | null }> = [];
  
  const deps: CloseStaleDeps = {
    async fetchSessionExercises(sessionIds) {
      return [
        {
          session_id: "stale-1",
          rest_seconds: REST_SECONDS,
          session_sets: [
            { id: "set-1", is_warmup_set: false, completed_at: LAST_SET_TIME },
          ],
        },
      ];
    },
    async markSessionDone(id, status, completedAt, durationSeconds) {
      updateCalls.push({ id, status, completed_at: completedAt, duration_seconds: durationSeconds });
      return true;
    },
    async markPlannedSkipped() {},
  };

  const credited = await closeStaleSessionsCore(
    deps,
    [{ id: "stale-1", local_date: "2026-10-27", started_at: STALE_TIME, actual_type: "weights", status: "in_progress" }],
    NOW_MS,
    "2026-10-27"
  );

  assertEquals(credited, 1, "session credited as completed");
  assertEquals(updateCalls.length, 1, "markSessionDone called once");
  
  const call = updateCalls[0];
  const startMs = Date.parse(STALE_TIME);
  const lastSetMs = Date.parse(LAST_SET_TIME);
  const expectedDuration = Math.floor((lastSetMs - startMs + REST_SECONDS * 1000) / 1000);
  
  assertEquals(call.duration_seconds, expectedDuration, `duration includes ${REST_SECONDS}s rest`);
  assertEquals(call.status, "completed", "status is completed");
  
  const completedAtMs = Date.parse(call.completed_at);
  const expectedEndedAtMs = lastSetMs + REST_SECONDS * 1000;
  assertEquals(completedAtMs, expectedEndedAtMs, `completed_at = last_set + ${REST_SECONDS}s`);
}

console.log("\n2. finish-session adds rest_seconds to stale duration");
{
  const updateCalls: Array<{ sessionId: string; patch: { status: string; completed_at: string | null; duration_seconds: number | null } }> = [];
  
  const deps: FinishSessionDeps = {
    async loadSession() {
      return {
        data: {
          started_at: STALE_TIME,
          local_date: "2026-10-27",
          user_id: "user-1",
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
            rest_seconds: REST_SECONDS,
            session_sets: [
              { id: "set-1", is_warmup_set: false, completed_at: LAST_SET_TIME },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession(sessionId, patch) {
      updateCalls.push({ sessionId, patch });
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const, duration_seconds: null }, error: null };
    },
    async loadExercisesForUpdate() {
      return {
        data: [
          {
            id: "ex-1",
            planned_sets: 3,
            status: "pending" as const,
            session_sets: [{ id: "set-1", is_warmup_set: false }],
          },
        ],
        error: null,
      };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
    now: () => NOW,
  };

  const result = await finishSessionCore(deps, {
    sessionId: "stale-1",
    durationSeconds: 9999, // Should be ignored for stale session
    cooldownCompleted: true,
  });

  assertTrue(result.ok, "finishSession succeeds");
  assertEquals(updateCalls.length, 1, "updateSession called once");
  
  const call = updateCalls[0];
  const startMs = Date.parse(STALE_TIME);
  const lastSetMs = Date.parse(LAST_SET_TIME);
  const expectedDuration = Math.floor((lastSetMs - startMs + REST_SECONDS * 1000) / 1000);
  
  assertEquals(call.patch.duration_seconds, expectedDuration, `duration includes ${REST_SECONDS}s rest`);
  assertEquals(call.patch.status, "completed", "status is completed");
  
  if (call.patch.completed_at) {
    const completedAtMs = Date.parse(call.patch.completed_at);
    const expectedEndedAtMs = lastSetMs + REST_SECONDS * 1000;
    assertEquals(completedAtMs, expectedEndedAtMs, `completed_at = last_set + ${REST_SECONDS}s`);
  } else {
    console.error(`❌ completed_at should not be null`);
    failed++;
  }
}

console.log("\n3. Both paths use the same duration for the same scenario");
{
  const closeStaleCall: { duration: number | null } = { duration: null };
  const finishCall: { duration: number | null } = { duration: null };
  
  // close-stale path
  const closeDeps: CloseStaleDeps = {
    async fetchSessionExercises() {
      return [
        {
          session_id: "test",
          rest_seconds: 75,
          session_sets: [
            { id: "set-1", is_warmup_set: false, completed_at: new Date(Date.parse(STALE_TIME) + 600000).toISOString() },
          ],
        },
      ];
    },
    async markSessionDone(_id, _status, _completedAt, durationSeconds) {
      closeStaleCall.duration = durationSeconds;
      return true;
    },
    async markPlannedSkipped() {},
  };
  
  await closeStaleSessionsCore(
    closeDeps,
    [{ id: "test", local_date: "2026-10-27", started_at: STALE_TIME, actual_type: "weights", status: "in_progress" }],
    NOW_MS,
    "2026-10-27"
  );
  
  // finish-session path
  const finishDeps: FinishSessionDeps = {
    async loadSession() {
      return { data: { started_at: STALE_TIME, local_date: "2026-10-27", user_id: "user-1" }, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises() {
      return {
        data: [
          {
            rest_seconds: 75,
            session_sets: [
              { id: "set-1", is_warmup_set: false, completed_at: new Date(Date.parse(STALE_TIME) + 600000).toISOString() },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession(_sessionId, patch) {
      finishCall.duration = patch.duration_seconds ?? null;
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const, duration_seconds: null }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: [{ id: "ex-1", planned_sets: 3, status: "pending" as const, session_sets: [{ id: "set-1", is_warmup_set: false }] }], error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
    now: () => NOW,
  };
  
  await finishSessionCore(finishDeps, { sessionId: "test", durationSeconds: 9999, cooldownCompleted: true });
  
  assertTrue(closeStaleCall.duration !== null, "close-stale computed a duration");
  assertTrue(finishCall.duration !== null, "finish-session computed a duration");
  assertEquals(closeStaleCall.duration, finishCall.duration, "both paths produce the same duration");
}

console.log("\n4. Null rest_seconds uses 300s default in both paths");
{
  const closeStaleCall: { duration: number | null } = { duration: null };
  const finishCall: { duration: number | null } = { duration: null };
  
  // close-stale path with null rest_seconds
  const closeDeps: CloseStaleDeps = {
    async fetchSessionExercises() {
      return [
        {
          session_id: "test",
          rest_seconds: null,
          session_sets: [
            { id: "set-1", is_warmup_set: false, completed_at: new Date(Date.parse(STALE_TIME) + 600000).toISOString() },
          ],
        },
      ];
    },
    async markSessionDone(_id, _status, _completedAt, durationSeconds) {
      closeStaleCall.duration = durationSeconds;
      return true;
    },
    async markPlannedSkipped() {},
  };
  
  await closeStaleSessionsCore(
    closeDeps,
    [{ id: "test", local_date: "2026-10-27", started_at: STALE_TIME, actual_type: "weights", status: "in_progress" }],
    NOW_MS,
    "2026-10-27"
  );
  
  // finish-session path with null rest_seconds
  const finishDeps: FinishSessionDeps = {
    async loadSession() {
      return { data: { started_at: STALE_TIME, local_date: "2026-10-27", user_id: "user-1" }, error: null };
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
              { id: "set-1", is_warmup_set: false, completed_at: new Date(Date.parse(STALE_TIME) + 600000).toISOString() },
            ],
          },
        ],
        error: null,
      };
    },
    async updateSession(_sessionId, patch) {
      finishCall.duration = patch.duration_seconds ?? null;
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus() {
      return { data: { status: "completed" as const, duration_seconds: null }, error: null };
    },
    async loadExercisesForUpdate() {
      return { data: [{ id: "ex-1", planned_sets: 3, status: "pending" as const, session_sets: [{ id: "set-1", is_warmup_set: false }] }], error: null };
    },
    async updateExerciseStatus() {
      return { error: null };
    },
    now: () => NOW,
  };
  
  await finishSessionCore(finishDeps, { sessionId: "test", durationSeconds: 9999, cooldownCompleted: true });
  
  assertEquals(closeStaleCall.duration, finishCall.duration, "both paths use 300s default for null rest_seconds");
  
  // Verify 300s was added (10 min base + 5 min rest = 15 min = 900s)
  const expectedWithDefault = 600 + 300;
  assertEquals(closeStaleCall.duration, expectedWithDefault, "duration includes 300s default rest");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All L-2 rest consistency tests passed!");
})();
