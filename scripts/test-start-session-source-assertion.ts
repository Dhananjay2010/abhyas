#!/usr/bin/env tsx
/**
 * Test #122b: Behavioral test for startSessionFullCore ensuring session exercises.
 * 
 * Replaced source-text test with behavioral test that verifies ensureSessionExercises
 * is called when resuming an existing session (the pickReusableSession path).
 * 
 *   npx tsx scripts/test-start-session-source-assertion.ts
 */

import { startSessionFullCore, type StartSessionFullDeps, type OpenSession } from "../src/lib/session/start-session-full-core";

const USER_ID = "user-test";
const TODAY = "2026-10-27";
const FIXED_TIMESTAMP = "2026-10-27T10:00:00.000Z";
const NOW_MS = new Date(FIXED_TIMESTAMP).getTime();

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

// Reuse the factory pattern from test-start-session-full-core.ts
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
    ],
    
    insertExercises: async () => ({ ok: true }),
    
    ...overrides,
  };
}

(async function main() {
console.log("\n#122b: Behavioral test for startSessionFullCore ensure-session-exercises\n");

console.log("1. Existing in_progress session calls ensureSessionExercises");
{
  let ensureWasCalled = false;
  let ensureCalledWithId: string | null = null;
  
  const deps = createBasicDeps({
    fetchOpenSessions: async () => [
      {
        id: "sess-existing-ip",
        status: "in_progress",
        local_date: TODAY,
        actual_type: "weights",
        started_at: FIXED_TIMESTAMP,
      },
    ],
    ensureSessionExercises: async (sessionId: string) => {
      ensureWasCalled = true;
      ensureCalledWithId = sessionId;
    },
  });
  
  const result = await startSessionFullCore(deps);
  
  assertEquals(result.ok, true, "startSession succeeds for existing in_progress");
  if (result.ok) {
    assertEquals(result.sessionId, "sess-existing-ip", "returns existing in_progress session");
  }
  assertEquals(ensureWasCalled, true, "ensureSessionExercises was called");
  assertEquals(ensureCalledWithId, "sess-existing-ip", "ensureSessionExercises called with correct session id");
}

console.log("\n2. Existing planned session calls ensureSessionExercises");
{
  let ensureWasCalled = false;
  let ensureCalledWithId: string | null = null;
  
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
    ensureSessionExercises: async (sessionId: string) => {
      ensureWasCalled = true;
      ensureCalledWithId = sessionId;
    },
  });
  
  const result = await startSessionFullCore(deps);
  
  assertEquals(result.ok, true, "startSession succeeds for existing planned");
  if (result.ok) {
    assertEquals(result.sessionId, "sess-planned", "returns existing planned session");
  }
  assertEquals(ensureWasCalled, true, "ensureSessionExercises was called");
  assertEquals(ensureCalledWithId, "sess-planned", "ensureSessionExercises called with correct session id");
}

console.log("\n3. New session does NOT call ensureSessionExercises");
{
  let ensureWasCalled = false;
  let insertExercisesCalled = false;
  
  const deps = createBasicDeps({
    fetchOpenSessions: async () => [],
    ensureSessionExercises: async () => {
      ensureWasCalled = true;
    },
    insertExercises: async () => {
      insertExercisesCalled = true;
      return { ok: true };
    },
  });
  
  const result = await startSessionFullCore(deps);
  
  assertEquals(result.ok, true, "startSession succeeds for new session");
  if (result.ok) {
    assertEquals(result.sessionId, "sess-new", "returns new session");
  }
  assertEquals(ensureWasCalled, false, "ensureSessionExercises NOT called for new session");
  assertEquals(insertExercisesCalled, true, "insertExercises IS called for new session");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}
console.log("\n✨ All #122b ensure exercises behavioral tests passed!");
})();
