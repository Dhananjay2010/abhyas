#!/usr/bin/env tsx
/**
 * Test 0-working-set rule for finish paths.
 *
 * Validates that sessions with 0 working sets are saved as 'skipped', not 'completed'.
 * This rule must apply on ALL paths: normal Finish, End early, and retries.
 *
 *   npx tsx scripts/test-0-working-set-rule.ts
 */

import { finishSessionCore } from "../src/lib/session/finish-session";
import type { FinishSessionDeps, SessionRow, SessionExerciseWithSets } from "../src/lib/session/finish-session-deps";
import { abandonSessionCore } from "../src/lib/session/abandon-session";
import type { AbandonSessionDeps } from "../src/lib/session/abandon-session-deps";

const NOW = "2026-10-25T12:00:00Z";
const NOW_MS = Date.parse(NOW);
const THIRTY_MIN_AGO = new Date(NOW_MS - 30 * 60 * 1000).toISOString();
const NOW_FN = () => NOW;

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
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

function makeFakeFinishSessionDeps(
  exercises: SessionExerciseWithSets[],
  updateError?: string,
  readError?: string
): FinishSessionDeps & AbandonSessionDeps & { calls: Array<{ method: string; table: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> }> } {
  const calls: Array<{ method: string; table: string; payload?: Record<string, unknown>; filters?: Record<string, unknown> }> = [];

  const session: SessionRow = {
    started_at: THIRTY_MIN_AGO,
    local_date: NOW.slice(0, 10),
    user_id: "user-123",
  };

  return {
    calls,
    async loadSession(id) {
      calls.push({ method: "loadSession", table: "sessions", filters: { id } });
      if (readError) return { data: null, error: readError };
      return { data: session, error: null };
    },
    async loadTimezone() {
      return { data: { timezone: "UTC" }, error: null };
    },
    async loadExercises(sessionId) {
      calls.push({ method: "loadExercises", table: "session_exercises", filters: { sessionId } });
      if (readError) return { data: null, error: readError };
      return { data: exercises, error: null };
    },
    async updateSession(id, patch) {
      calls.push({ method: "updateSession", table: "sessions", payload: patch, filters: { id } });
      if (updateError) return { error: updateError, updatedCount: 0 };
      return { error: null, updatedCount: 1 };
    },
    async loadSessionStatus(id) {
      calls.push({ method: "loadSessionStatus", table: "sessions", filters: { id } });
      return { data: { status: "completed" }, error: null };
    },
    async loadExercisesForUpdate(sessionId) {
      calls.push({ method: "loadExercisesForUpdate", table: "session_exercises", filters: { sessionId } });
      return { data: [], error: null };
    },
    async updateExerciseStatus(id, status) {
      calls.push({ method: "updateExerciseStatus", table: "session_exercises", payload: { status }, filters: { id } });
      return { error: null };
    },
    async loadSessionMetadata(id: string) {
      calls.push({ method: "loadSessionMetadata", table: "sessions", filters: { id } });
      return { data: { started_at: session.started_at }, error: null };
    },
    async loadExercisesWithSets(sessionId: string) {
      calls.push({ method: "loadExercisesWithSets", table: "session_exercises", filters: { sessionId } });
      return { data: exercises.map(ex => ({
        rest_seconds: ex.rest_seconds,
        session_sets: (ex.session_sets ?? []).map(s => ({
          completed_at: s.completed_at ?? NOW,
          is_warmup_set: s.is_warmup_set,
        })),
      })), error: null };
    },
    now: NOW_FN,
  };
}


(async () => {
  console.log("🧪 Testing 0-working-set rule\n");

  // Test 1: Skip all exercises then Finish -> should give 'skipped'
  console.log("1. Skip all exercises then Finish");
  {
    const exercises = [
      { rest_seconds: null, session_sets: [] }, // All exercises skipped, no sets at all
      { rest_seconds: null, session_sets: [] },
      { rest_seconds: null, session_sets: [] },
    ];

    const fake = makeFakeFinishSessionDeps(exercises);
    const result = await finishSessionCore(fake, {
      sessionId: "s1",
      durationSeconds: 300,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "Skip all -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "updateSession");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 2: Skip all exercises, only warm-up sets logged, then Finish -> should give 'skipped'
  console.log("\n2. Skip all, only warm-up sets logged, then Finish");
  {
    const exercises = [
      { rest_seconds: null, session_sets: [{ id: "w1", is_warmup_set: true, completed_at: null }, { id: "w2", is_warmup_set: true, completed_at: null }] },
      { rest_seconds: null, session_sets: [] },
      { rest_seconds: null, session_sets: [{ id: "w3", is_warmup_set: true, completed_at: null }] },
    ];

    const fake = makeFakeFinishSessionDeps(exercises);
    const result = await finishSessionCore(fake, {
      sessionId: "s2",
      durationSeconds: 600,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "Only warm-up sets -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "updateSession");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 3: End early with 0 working sets -> should give 'skipped'
  console.log("\n3. End early with 0 working sets");
  {
    const exercises = [
      { rest_seconds: null, session_sets: [{ id: "w1", is_warmup_set: true, completed_at: null }] },
      { rest_seconds: null, session_sets: [] },
    ];

    const fake = makeFakeFinishSessionDeps(exercises);
    const result = await abandonSessionCore(fake, "s3", 200);

    assertTrue(result.ok, "Abandon should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "skipped", "End early with 0 working sets -> status must be 'skipped'");
    }

    const updateCall = fake.calls.find((c) => c.method === "updateSession");
    assertEquals(updateCall?.payload?.status, "skipped", "DB update must save 'skipped'");
    assertEquals(updateCall?.payload?.completed_at, null, "completed_at must be null for skipped");
  }

  // Test 4: Finish with 1+ working sets -> should give 'completed'
  console.log("\n4. Finish with 1+ working sets");
  {
    const exercises = [
      { rest_seconds: null, session_sets: [{ id: "w1", is_warmup_set: true, completed_at: null }] },
      { rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: null }] }, // One working set
      { rest_seconds: null, session_sets: [] },
    ];

    const fake = makeFakeFinishSessionDeps(exercises);
    const result = await finishSessionCore(fake, {
      sessionId: "s4",
      durationSeconds: 900,
      cooldownCompleted: true,
    });

    assertTrue(result.ok, "Finish should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "1+ working sets -> status must be 'completed'");
    }

    const updateCall = fake.calls.find((c) => c.method === "updateSession");
    assertEquals(updateCall?.payload?.status, "completed", "DB update must save 'completed'");
    assertTrue(updateCall?.payload?.completed_at !== null && updateCall?.payload?.completed_at !== undefined, "completed_at must be set for completed");
  }

  // Test 5: End early with 1+ working sets -> should give 'completed'
  console.log("\n5. End early with 1+ working sets");
  {
    const exercises = [
      { rest_seconds: null, session_sets: [{ id: "s1", is_warmup_set: false, completed_at: null }, { id: "s2", is_warmup_set: false, completed_at: null }] },
      { rest_seconds: null, session_sets: [] }, // Not reached
    ];

    const fake = makeFakeFinishSessionDeps(exercises);
    const result = await abandonSessionCore(fake, "s5", 400);

    assertTrue(result.ok, "Abandon should succeed");
    if (result.ok) {
      assertEquals(result.data.status, "completed", "End early with working sets -> status must be 'completed'");
    }

    const updateCall = fake.calls.find((c) => c.method === "updateSession");
    assertEquals(updateCall?.payload?.status, "completed", "DB update must save 'completed'");
    assertTrue(updateCall?.payload?.completed_at !== null && updateCall?.payload?.completed_at !== undefined, "completed_at must be set for completed");
  }

  // Summary
  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All 0-working-set rule tests passed!");
})();
