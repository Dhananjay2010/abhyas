#!/usr/bin/env tsx
/**
 * Test M11: Ensure stale-core errors are properly surfaced, not ignored.
 * 
 * Bug: If the stale-core error check is removed, the result can come back
 * {ok: true, sessionId: undefined}, which is invalid.
 * 
 * Mutant: Ignore the stale-core error and continue.
 */
import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";

export {};

const USER_ID = "user-test";
const NOW_MS = new Date("2026-10-26T14:00:00Z").getTime();

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

async function main() {
  console.log("M11: Stale-core error handling\n");

  await test("Stale-core error is surfaced, not ignored", async () => {
  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [
      {
        id: "sess-other-date",
        status: "in_progress",
        local_date: "2026-10-25",
        actual_type: "weights",
        started_at: "2026-10-25T10:00:00Z",
      },
    ],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => ({
      ok: true,
      program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
      dayId: `day-${dayIndex}`,
      dayType: "weights",
    }),
    
    findInProgressToday: async () => [],
    
    buildStaleDeps: (openSessions: OpenSession[], today: string, nowMs: number) => {
      void nowMs;
      return {
        today,
        readOpenSessions: async () => openSessions,
        closeStaleSessions: async () => 0,
        checkRemainingInProgress: async () => ({ ok: false, error: "Database error checking remaining sessions" }),
      };
    },
    
    insertSession: async () => {
      throw new Error("insertSession should not be called when stale-core errors");
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, false, "Result should be not ok when stale-core errors");
  if (!result.ok) {
    eq(result.error, "Database error checking remaining sessions", "Should return the stale-core error");
  }
});

await test("Result never has ok:true with undefined sessionId", async () => {
  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => ({
      ok: true,
      program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
      dayId: `day-${dayIndex}`,
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
  if (result.ok) {
    eq(typeof result.sessionId, "string", "sessionId must be a string, never undefined");
    eq(result.sessionId.length > 0, true, "sessionId must be non-empty");
  }
});

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
