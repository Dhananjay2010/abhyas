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
    
    updateSession: async (sessionId, today, payload) => ({ ok: true, sessionId }),
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

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
