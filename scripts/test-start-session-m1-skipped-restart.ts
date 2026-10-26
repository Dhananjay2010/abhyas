#!/usr/bin/env tsx
/**
 * Test M1: Restarting a skipped session resets started_at.
 * 
 * Mutant: Keep the old started_at instead of resetting it to now.
 * This mutant proof ensures the six-hour-workout bug cannot return.
 */
import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";

export {};

const USER_ID = "user-test";
const TODAY = "2026-10-26";
const OLD_TIMESTAMP = "2026-10-25T08:00:00.000Z";
const NEW_TIMESTAMP = "2026-10-26T14:30:00.000Z";
const NOW_MS = new Date(NEW_TIMESTAMP).getTime();

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

type UpdatePayload = { status: string; started_at?: string };

async function main() {
  console.log("M1: Skipped session restart resets started_at\n");

  await test("Restarting a skipped session resets started_at to now", async () => {
    const captured: { payload: UpdatePayload | null } = { payload: null };

    const deps: StartSessionFullDeps = {
      userId: USER_ID,
      nowMs: NOW_MS,
      
      fetchProfile: async () => ({ timezone: "America/New_York" }),
      fetchOpenSessions: async () => [
        {
          id: "sess-skipped-old",
          status: "skipped",
          local_date: TODAY,
          actual_type: "weights",
          started_at: OLD_TIMESTAMP,
        },
      ],
      fetchResumeEnabled: async () => true,
      
      updateSession: async (sessionId, today, payload) => {
        captured.payload = payload;
        return { ok: true, sessionId };
      },
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
      fetchPlannedExercises: async () => [],
      insertExercises: async () => ({ ok: true }),
    };

    const result = await startSessionFullCore(deps);
    
    eq(result.ok, true, "Result should be ok");
    eq(captured.payload !== null, true, "Update payload should be captured");
    if (!captured.payload) throw new Error("Update payload should be captured");
    eq(captured.payload.status, "in_progress", "Status should be in_progress");
    eq("started_at" in captured.payload, true, "started_at must be in payload (to reset from OLD to NEW)");
    eq(captured.payload.started_at, NEW_TIMESTAMP, "started_at should be NEW_TIMESTAMP");
  });

  await test("Restarting a planned session with null started_at sets it to now", async () => {
    const captured: { payload: UpdatePayload | null } = { payload: null };

    const deps: StartSessionFullDeps = {
      userId: USER_ID,
      nowMs: NOW_MS,
      
      fetchProfile: async () => ({ timezone: "America/New_York" }),
      fetchOpenSessions: async () => [
        {
          id: "sess-planned-null",
          status: "planned",
          local_date: TODAY,
          actual_type: "weights",
          started_at: null,
        },
      ],
      fetchResumeEnabled: async () => true,
      
      updateSession: async (sessionId, today, payload) => {
        captured.payload = payload;
        return { ok: true, sessionId };
      },
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
      fetchPlannedExercises: async () => [],
      insertExercises: async () => ({ ok: true }),
    };

    const result = await startSessionFullCore(deps);
    
    eq(result.ok, true, "Result should be ok");
    eq(captured.payload !== null, true, "Update payload should be captured");
    if (!captured.payload) throw new Error("Update payload should be captured");
    eq(captured.payload.started_at, NEW_TIMESTAMP, "started_at should be set to NEW_TIMESTAMP");
  });

  await test("Resuming an in_progress session keeps existing started_at", async () => {
    const captured: { payload: UpdatePayload | null } = { payload: null };

    const deps: StartSessionFullDeps = {
      userId: USER_ID,
      nowMs: NOW_MS,
      
      fetchProfile: async () => ({ timezone: "America/New_York" }),
      fetchOpenSessions: async () => [
        {
          id: "sess-inprog",
          status: "in_progress",
          local_date: TODAY,
          actual_type: "weights",
          started_at: OLD_TIMESTAMP,
        },
      ],
      fetchResumeEnabled: async () => true,
      
      updateSession: async (sessionId, today, payload) => {
        captured.payload = payload;
        return { ok: true, sessionId };
      },
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
      fetchPlannedExercises: async () => [],
      insertExercises: async () => ({ ok: true }),
    };

    const result = await startSessionFullCore(deps);
    
    eq(result.ok, true, "Result should be ok");
    eq(captured.payload !== null, true, "Update payload should be captured");
    if (!captured.payload) throw new Error("Update payload should be captured");
    eq(captured.payload.started_at, undefined, "started_at should not be in payload (keeps existing)");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
