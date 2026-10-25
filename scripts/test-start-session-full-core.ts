#!/usr/bin/env tsx
/**
 * Test: startSessionFullCore with plain typed fake dependencies.
 * 
 * No network, no `as`, no `!`. Just plain functions that record their calls.
 */
import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";

export {};

const USER_ID = "user-test";
const TODAY = "2026-10-26";
const FIXED_TIMESTAMP = "2026-10-26T10:00:00.000Z";
const NOW_MS = new Date(FIXED_TIMESTAMP).getTime();
const YESTERDAY = "2026-10-25";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createBasicDeps(overrides: Partial<StartSessionFullDeps> = {}): StartSessionFullDeps {
  return {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async () => ({
      ok: true,
      program: { id: "prog-1", started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
      dayId: "day-1",
      dayType: "weights",
    }),
    
    findInProgressToday: async () => [],
    
    buildStaleDeps: (openSessions: OpenSession[], today: string, nowMs: number) => {
      void nowMs;
      return {
        today,
        readOpenSessions: async () => openSessions,
        closeStaleSessions: async () => 0,
        checkRemainingInProgress: async () => ({ ok: true, sessionId: null }),
      };
    },
    
    insertSession: async () => ({ ok: true, sessionId: "sess-new" }),
    
    fetchPlannedExercises: async () => [
      {
        exercise_id: "ex-1",
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
        exercises: { metric: "reps" },
      },
      {
        exercise_id: "ex-2",
        order_index: 1,
        target_sets: 3,
        target_reps_min: 10,
        target_reps_max: 15,
        rest_seconds: 60,
        exercises: { metric: "reps" },
      },
    ],
    
    insertExercises: async () => ({ ok: true }),
    
    ...overrides,
  };
}

async function main() {
  console.log("Testing startSessionFullCore\n");

  await test("Fresh start: inserts new session and exercises", async () => {
    let insertedExercises: unknown[] = [];
    
    const deps = createBasicDeps({
      insertExercises: async (exercises) => {
        insertedExercises = exercises;
        return { ok: true };
      },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    eq(result.sessionId, "sess-new", "New session ID returned");
    eq(insertedExercises.length, 2, "Two exercises inserted");
  });

  await test("L3: Stale session closed, then new start", async () => {
    let closeCalled = false;
    
    const deps = createBasicDeps({
      fetchOpenSessions: async () => [
        {
          id: "sess-stale",
          status: "in_progress",
          local_date: YESTERDAY,
          actual_type: "weights",
          started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
        },
      ],
      buildStaleDeps: (openSessions, today, nowMs) => {
        void nowMs;
        return {
          today,
          readOpenSessions: async () => openSessions,
          closeStaleSessions: async (sessions) => {
            closeCalled = true;
            eq(sessions.length, 1, "One session passed to close");
            return 1;
          },
          checkRemainingInProgress: async () => ({ ok: true, sessionId: null }),
        };
      },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    if (!closeCalled) throw new Error("Close was not called");
    eq(result.sessionId, "sess-new", "New session created after close");
  });

  await test("#111: Fresh in_progress session resumed (< 6h)", async () => {
    const deps = createBasicDeps({
      fetchOpenSessions: async () => [
        {
          id: "sess-fresh",
          status: "in_progress",
          local_date: YESTERDAY,
          actual_type: "weights",
          started_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(),
        },
      ],
      buildStaleDeps: (openSessions, today, nowMs) => {
        void nowMs;
        return {
          today,
          readOpenSessions: async () => openSessions,
          closeStaleSessions: async () => 0,
          checkRemainingInProgress: async () => ({ ok: true, sessionId: "sess-fresh" }),
        };
      },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    eq(result.sessionId, "sess-fresh", "Fresh session resumed via #111");
  });

  await test("Case C: Idempotent same-date in_progress check", async () => {
    const deps = createBasicDeps({
      findInProgressToday: async () => [
        {
          id: "sess-existing",
          user_id: USER_ID,
          program_id: "prog-1",
          program_day_id: "day-1",
          local_date: TODAY,
          week_in_block: 1,
          is_deload: false,
          planned_type: "weights",
          actual_type: "weights",
          status: "in_progress",
          started_at: FIXED_TIMESTAMP,
          completed_at: null,
          created_at: FIXED_TIMESTAMP,
          updated_at: FIXED_TIMESTAMP,
          breathing_pattern_id: null,
          cooldown_completed: false,
          duration_seconds: null,
          energy_rating: null,
          quality_rating: null,
          warmup_completed: false,
          yoga_video_id: null,
          notes: null,
        },
      ],
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    eq(result.sessionId, "sess-existing", "Existing session returned (Case C)");
  });

  await test("P7: Insert error returned", async () => {
    const deps = createBasicDeps({
      insertSession: async () => ({ ok: false, error: "duplicate key" }),
    });

    const result = await startSessionFullCore(deps);

    if (result.ok) throw new Error("Expected error, got ok");
    if (!result.error.includes("duplicate key")) {
      throw new Error(`Expected "duplicate key" error, got: ${result.error}`);
    }
  });

  await test("P8: Exercises inserted after session", async () => {
    let exercisesInserted = false;
    
    const deps = createBasicDeps({
      insertExercises: async (exercises) => {
        exercisesInserted = true;
        eq(exercises.length, 2, "Two exercises to insert");
        eq(exercises[0].session_id, "sess-new", "Exercises linked to session");
        return { ok: true };
      },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    if (!exercisesInserted) throw new Error("Exercises were not inserted");
  });

  await test("Resume: planned session reused when resume enabled", async () => {
    let updateCalled = false;
    
    const deps = createBasicDeps({
      fetchOpenSessions: async () => [
        {
          id: "sess-planned",
          status: "planned",
          local_date: TODAY,
          actual_type: "weights",
          started_at: null,
        },
      ],
      updateSession: async (sessionId, today, payload) => {
        updateCalled = true;
        eq(sessionId, "sess-planned", "Planned session updated");
        eq(today, TODAY, "Today date passed correctly");
        eq(payload.status, "in_progress", "Status updated to in_progress");
        return { ok: true, sessionId };
      },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    eq(result.sessionId, "sess-planned", "Planned session reused");
    if (!updateCalled) throw new Error("Update was not called");
  });

  await test("P5: ensureCurrentBlock error returned", async () => {
    const deps = createBasicDeps({
      ensureCurrentBlock: async () => ({ status: "error", error: "database unavailable" }),
    });

    const result = await startSessionFullCore(deps);

    if (result.ok) throw new Error("Expected error, got ok");
    if (!result.error.includes("database unavailable")) {
      throw new Error(`Expected "database unavailable" error, got: ${result.error}`);
    }
  });

  await test("P6: loadProgram error returned", async () => {
    const deps = createBasicDeps({
      loadProgram: async () => ({ ok: false, error: "program not found" }),
    });

    let result: Awaited<ReturnType<typeof startSessionFullCore>>;
    try {
      result = await startSessionFullCore(deps);
    } catch (err) {
      throw new Error(`Core crashed instead of returning error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (result.ok) throw new Error("Expected error, got ok");
    if (!result.error.includes("program not found")) {
      throw new Error(`Expected "program not found" error, got: ${result.error}`);
    }
  });

  await test("BUG CATCH: update returns different id than existing", async () => {
    const deps = createBasicDeps({
      fetchOpenSessions: async () => [{
        id: "sess-planned",
        status: "planned" as const,
        local_date: TODAY,
        actual_type: null,
        started_at: null,
      }],
      updateSession: async (id) => { void id; return { ok: true, sessionId: "WRONG-ID" }; },
    });

    const result = await startSessionFullCore(deps);

    if (!result.ok) throw new Error(`Expected ok, got ${result.error}`);
    if (result.sessionId !== "sess-planned") {
      throw new Error(`updateSession returned wrong id but core used it: ${result.sessionId}`);
    }
  });

  await test("BUG CATCH: update error propagates", async () => {
    const deps = createBasicDeps({
      fetchOpenSessions: async () => [{
        id: "sess-planned",
        status: "planned" as const,
        local_date: TODAY,
        actual_type: null,
        started_at: null,
      }],
      updateSession: async () => ({ ok: false, error: "update failed" }),
    });

    const result = await startSessionFullCore(deps);

    if (result.ok) throw new Error("Expected error, got ok");
    eq(result.error, "update failed", "Update error propagated");
  });

  await test("BUG CATCH: started_at stamp inserted", async () => {
    let insertPayload: unknown = null;
    const deps = createBasicDeps({
      insertSession: async (payload) => {
        insertPayload = payload;
        return { ok: true, sessionId: "sess-new" };
      },
    });

    await startSessionFullCore(deps);

    if (!insertPayload || typeof insertPayload !== "object") throw new Error("No insert payload");
    const p = insertPayload as Record<string, unknown>;
    if (!p.started_at) throw new Error("started_at not set");
    eq(typeof p.started_at, "string", "started_at is string timestamp");
  });

  await test("BUG CATCH: deload week calculation", async () => {
    let insertPayload: unknown = null;
    const deps = createBasicDeps({
      loadProgram: async () => ({
        ok: true,
        program: { id: "prog-1", started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
        dayId: "day-1",
        dayType: "weights",
      }),
      insertSession: async (payload) => {
        insertPayload = payload;
        return { ok: true, sessionId: "sess-new" };
      },
    });

    await startSessionFullCore(deps);

    if (!insertPayload || typeof insertPayload !== "object") throw new Error("No insert payload");
    const p = insertPayload as Record<string, unknown>;
    eq(p.week_in_block, 4, "Week in block calculated");
    eq(p.is_deload, true, "Deload flag set for week 4");
  });

  await test("BUG CATCH: near-midnight NY/UTC date differ", async () => {
    let insertPayload: unknown = null;
    const nowMs = new Date("2026-10-26T04:30:00Z").getTime();
    const deps = createBasicDeps({
      nowMs,
      fetchProfile: async () => ({ timezone: "America/New_York" }),
      insertSession: async (payload) => {
        insertPayload = payload;
        return { ok: true, sessionId: "sess-new" };
      },
    });

    await startSessionFullCore(deps);

    if (!insertPayload || typeof insertPayload !== "object") throw new Error("No insert payload");
    const p = insertPayload as Record<string, unknown>;
    eq(p.local_date, "2026-10-26", "NY date is 2026-10-26 (00:30 EDT)");
  });

  await test("BUG CATCH: seconds metric handled", async () => {
    let insertedExercises: unknown[] = [];
    const deps = createBasicDeps({
      fetchPlannedExercises: async () => [{
        exercise_id: "ex-plank",
        order_index: 0,
        target_sets: 3,
        target_reps_min: 30,
        target_reps_max: 60,
        rest_seconds: 90,
        exercises: { metric: "seconds" },
      }],
      insertExercises: async (exercises) => {
        insertedExercises = exercises;
        return { ok: true };
      },
    });

    await startSessionFullCore(deps);

    if (insertedExercises.length !== 1) throw new Error("Expected 1 exercise");
    const ex = insertedExercises[0] as Record<string, unknown>;
    eq(ex.metric, "seconds", "Metric is seconds");
  });

  await test("BUG CATCH: full insert payload structure", async () => {
    let insertPayload: unknown = null;
    const deps = createBasicDeps({
      insertSession: async (payload) => {
        insertPayload = payload;
        return { ok: true, sessionId: "sess-new" };
      },
    });

    await startSessionFullCore(deps);

    if (!insertPayload || typeof insertPayload !== "object") throw new Error("No insert payload");
    const p = insertPayload as Record<string, unknown>;
    eq(p.user_id, USER_ID, "user_id");
    eq(p.program_id, "prog-1", "program_id");
    eq(p.program_day_id, "day-1", "program_day_id");
    eq(p.local_date, TODAY, "local_date");
    eq(p.status, "in_progress", "status");
    eq(typeof p.started_at, "string", "started_at");
    eq(typeof p.week_in_block, "number", "week_in_block");
    eq(typeof p.is_deload, "boolean", "is_deload");
  });

  await test("BUG CATCH: today passed to stale step", async () => {
    let staleTodayArg = "";
    const deps = createBasicDeps({
      buildStaleDeps: (openSessions, today) => {
        staleTodayArg = today;
        return {
          today,
          readOpenSessions: async () => openSessions,
          closeStaleSessions: async () => 0,
          checkRemainingInProgress: async () => ({ ok: true, sessionId: null }),
        };
      },
    });

    await startSessionFullCore(deps);

    eq(staleTodayArg, TODAY, "Today passed to buildStaleDeps");
  });

  await test("BUG CATCH: exercise insert error propagates", async () => {
    const deps = createBasicDeps({
      insertExercises: async () => ({ ok: false, error: "insert exercises failed" }),
    });

    const result = await startSessionFullCore(deps);

    if (result.ok) throw new Error("Expected error, got ok");
    eq(result.error, "insert exercises failed", "Exercise insert error propagated");
  });

  await test("BUG CATCH: different-day existingSessionId skips insertExercises", async () => {
    let exercisesInserted = false;
    const deps = createBasicDeps({
      insertSession: async () => ({
        ok: false,
        error: "You have an open session from a different day.",
        existingSessionId: "sess-yesterday",
      }),
      insertExercises: async () => {
        exercisesInserted = true;
        return { ok: true };
      },
    });

    const result = await startSessionFullCore(deps);

    if (result.ok) throw new Error("Expected error when different-day session exists");
    if (exercisesInserted) {
      throw new Error("insertExercises was called despite different-day conflict");
    }
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
