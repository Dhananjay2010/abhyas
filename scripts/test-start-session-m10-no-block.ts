#!/usr/bin/env tsx
/**
 * Test M10: Ensure the "no active training block" check is enforced.
 * 
 * Mutant: Remove the ensureCurrentBlock check.
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
  console.log("M10: No active training block check\n");

  await test("Returns error when no active training block exists", async () => {
  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "none" }),
    
    loadProgram: async () => {
      throw new Error("loadProgram should not be called when no block exists");
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
    
    insertSession: async () => {
      throw new Error("insertSession should not be called when no block exists");
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, false, "Result should be not ok");
  if (!result.ok) {
    eq(result.error, "You have no active training block.", "Should return the correct error message");
  }
});

await test("Returns error when ensureCurrentBlock returns error status", async () => {
  const deps: StartSessionFullDeps = {
    userId: USER_ID,
    nowMs: NOW_MS,
    
    fetchProfile: async () => ({ timezone: "America/New_York" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => true,
    
    updateSession: async (sessionId) => ({ ok: true, sessionId }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "error", error: "Block check failed" }),
    
    loadProgram: async () => {
      throw new Error("loadProgram should not be called when block check errors");
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
    
    insertSession: async () => {
      throw new Error("insertSession should not be called when block check errors");
    },
    
    fetchPlannedExercises: async () => [],
    insertExercises: async () => ({ ok: true }),
  };

  const result = await startSessionFullCore(deps);
  
  eq(result.ok, false, "Result should be not ok");
  if (!result.ok) {
    eq(result.error, "Block check failed", "Should return the error from ensureCurrentBlock");
  }
});

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
