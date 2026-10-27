#!/usr/bin/env tsx
/**
 * Test M9: Assert WHICH planned day was started (program_day_id, day_index, weekday).
 * Include Asia/Kolkata cases near midnight where UTC date differs from local date.
 * Must pass under both TZ=UTC and TZ=Asia/Kolkata.
 * 
 * Mutant: Use UTC date instead of local date to compute weekday.
 */
import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";

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
  console.log("M9: Weekday and timezone-aware day selection\n");

  await test("Monday 2026-10-26 starts day 1 workout (America/New_York)", async () => {
    let capturedDayIndex: number | null = null;
    let capturedProgramDayId: string | null | undefined = null;
    let capturedLocalDate: string | null | undefined = null;

  const NOW_MS = new Date("2026-10-26T14:00:00Z").getTime(); // Mon 2026-10-26 10:00 EDT

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => {
      capturedDayIndex = dayIndex;
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
        dayId: `day-${dayIndex}`,
        dayType: "weights",
      };
    },
    
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
    
    insertSession: async (payload) => {
      capturedProgramDayId = payload.program_day_id;
      capturedLocalDate = payload.local_date;
      return { ok: true, sessionId: "sess-new" };
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(capturedDayIndex, 1, "Monday should be day 1");
  eq(capturedProgramDayId, "day-1", "program_day_id should be day-1");
  eq(capturedLocalDate, "2026-10-26", "local_date should be 2026-10-26");
});

await test("Sunday 2026-11-01 starts day 7 workout (America/New_York)", async () => {
  let capturedDayIndex: number | null = null;

  const NOW_MS = new Date("2026-11-01T14:00:00Z").getTime(); // Sun 2026-11-01

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => {
      capturedDayIndex = dayIndex;
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
        dayId: `day-${dayIndex}`,
        dayType: "weights",
      };
    },
    
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
  eq(capturedDayIndex, 7, "Sunday should be day 7");
});

await test("Asia/Kolkata 23:50 IST (18:20 UTC same day) starts correct local day", async () => {
    let capturedDayIndex: number | null = null;
    let capturedLocalDate: string | null = null;

  // 2026-10-26 23:50 IST = 2026-10-26 18:20 UTC (same UTC date)
  const NOW_MS = new Date("2026-10-26T18:20:00Z").getTime();

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "Asia/Kolkata" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => {
      capturedDayIndex = dayIndex;
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
        dayId: `day-${dayIndex}`,
        dayType: "weights",
      };
    },
    
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
    
    insertSession: async (payload) => {
      capturedLocalDate = payload.local_date;
      return { ok: true, sessionId: "sess-new" };
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(capturedLocalDate, "2026-10-26", "local_date should be 2026-10-26 (IST date)");
  eq(capturedDayIndex, 1, "Monday 2026-10-26 IST should be day 1");
});

await test("Asia/Kolkata 00:10 IST (18:40 UTC previous day) starts correct local day", async () => {
    let capturedDayIndex: number | null = null;
    let capturedLocalDate: string | null = null;

  // 2026-10-27 00:10 IST = 2026-10-26 18:40 UTC (different UTC date)
  const NOW_MS = new Date("2026-10-26T18:40:00Z").getTime();

  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "Asia/Kolkata" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
    
    loadProgram: async (programId, dayIndex) => {
      capturedDayIndex = dayIndex;
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-01", deload_week: 4, week_offset: 0 },
        dayId: `day-${dayIndex}`,
        dayType: "weights",
      };
    },
    
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
    
    insertSession: async (payload) => {
      capturedLocalDate = payload.local_date;
      return { ok: true, sessionId: "sess-new" };
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, true, "Result should be ok");
  eq(capturedLocalDate, "2026-10-27", "local_date should be 2026-10-27 (IST date, not UTC)");
  eq(capturedDayIndex, 2, "Tuesday 2026-10-27 IST should be day 2");
});

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
