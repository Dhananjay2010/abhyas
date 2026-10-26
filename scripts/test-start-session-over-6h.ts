#!/usr/bin/env tsx
/**
 * Test: Session open >6 hours is CLOSED, not resumed.
 * Also test that a fresh in-progress session from another date/type is still resumed.
 * 
 * Mutant: Set 6-hour threshold to huge value so it never triggers.
 */
import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";
import { STALE_INACTIVITY_THRESHOLD_SECONDS } from "../src/lib/session/close-stale";

export {};

const USER_ID = "user-test";

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
  console.log("Over-6-hours: Stale session closing behavior\n");

  await test("Session open >6 hours is closed, new session is started", async () => {
  const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime(); // 8pm today
  const OLD_START = "2026-10-25T10:00:00Z"; // 10am yesterday, >30 hours old
  
  const elapsedSeconds = (NOW_MS - new Date(OLD_START).getTime()) / 1000;
  const shouldBeStale = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;
  
  let closeWasCalled = false;
  let insertWasCalled = false;
  let checkRemainingCalled = false;

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [
      {
        id: "sess-stale",
        status: "in_progress",
        local_date: "2026-10-25",
        actual_type: "weights",
        started_at: OLD_START,
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
        closeStaleSessions: async (inProgressSessions) => {
          closeWasCalled = true;
          eq(inProgressSessions.length, 1, "Should pass 1 in_progress session to close");
          return shouldBeStale ? 1 : 0;
        },
        checkRemainingInProgress: async () => {
          checkRemainingCalled = true;
          return { ok: true, sessionId: shouldBeStale ? null : "sess-stale" };
        },
      };
    },
    
    insertSession: async () => {
      insertWasCalled = true;
      return { ok: true, sessionId: "sess-new" };
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(closeWasCalled, true, "closeStaleSessions should be called");
  eq(checkRemainingCalled, true, "checkRemainingInProgress should be called");
  eq(shouldBeStale, true, "Session should be stale (>6h threshold check)");
  eq(insertWasCalled, true, "New session should be inserted after closing stale one");
  if (result.ok) {
    eq(result.sessionId, "sess-new", "Should return new session ID, not old stale one");
  }
});

await test("Fresh in-progress session from another date is resumed, not closed", async () => {
  const NOW_MS = new Date("2026-10-26T12:00:00Z").getTime(); // noon today
  const RECENT_START = "2026-10-26T10:30:00Z"; // 1.5 hours ago, still fresh
  
  const elapsedSeconds = (NOW_MS - new Date(RECENT_START).getTime()) / 1000;
  const shouldBeStale = elapsedSeconds >= STALE_INACTIVITY_THRESHOLD_SECONDS;
  
  let closeWasCalled = false;
  let insertWasCalled = false;

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [
      {
        id: "sess-fresh-other-date",
        status: "in_progress",
        local_date: "2026-10-25",
        actual_type: "weights",
        started_at: RECENT_START,
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
        closeStaleSessions: async () => {
          closeWasCalled = true;
          return shouldBeStale ? 1 : 0;
        },
        checkRemainingInProgress: async () => {
          return { ok: true, sessionId: shouldBeStale ? null : "sess-fresh-other-date" };
        },
      };
    },
    
    insertSession: async () => {
      insertWasCalled = true;
      return { ok: true, sessionId: "sess-new" };
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(closeWasCalled, true, "closeStaleSessions should be called");
  eq(shouldBeStale, false, "Session should NOT be stale (<6h threshold check)");
  eq(insertWasCalled, false, "Should NOT insert new session, should resume fresh one");
  if (result.ok) {
    eq(result.sessionId, "sess-fresh-other-date", "Should resume fresh session from other date");
  }
});

await test("Fresh in-progress session from today (same date) is resumed immediately", async () => {
  const NOW_MS = new Date("2026-10-26T12:00:00Z").getTime();
  const RECENT_START = "2026-10-26T10:30:00Z";
  
  let buildStaleDepsCalled = false;

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [
      {
        id: "sess-today-inprog",
        status: "in_progress",
        local_date: "2026-10-26",
        actual_type: "weights",
        started_at: RECENT_START,
      },
    ],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => {
      throw new Error("ensureCurrentBlock should not be called when resuming same-day session");
    },
    
    loadProgram: async () => {
      throw new Error("loadProgram should not be called when resuming same-day session");
    },
    
    findInProgressToday: async () => [],
    
    buildStaleDeps: () => {
      buildStaleDepsCalled = true;
      throw new Error("buildStaleDeps should not be called when resuming same-day session");
    },
    
    insertSession: async () => {
      throw new Error("insertSession should not be called when resuming same-day session");
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(buildStaleDepsCalled, false, "Stale-close logic should not run for same-day session");
  if (result.ok) {
    eq(result.sessionId, "sess-today-inprog", "Should resume today's in_progress session");
  }
});

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
