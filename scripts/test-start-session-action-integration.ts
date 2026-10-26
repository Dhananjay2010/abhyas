#!/usr/bin/env tsx
/**
 * Integration test: startSession() action goes through startSessionFullCore
 * with stale-close logic.
 *
 * Ensures production startSession actually closes over-6h sessions before resume,
 * and that the action doesn't bypass the core by using the old inline flow.
 *
 * Mutant: Restore main's inline startSession (without stale-close) in actions.ts.
 * It must FAIL on the import check or source verification.
 */

import { readFileSync } from "fs";
import { startSessionFullCore, type StartSessionFullDeps } from "../src/lib/session/start-session-full-core";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";

export {};

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("Integration: startSession() goes through startSessionFullCore with stale-close\n");

  await test("actions.ts imports startSessionFullCore", () => {
    const source = readFileSync("src/app/session/actions.ts", "utf-8");
    const hasImport = source.includes("startSessionFullCore");
    assert(hasImport, "actions.ts must import startSessionFullCore");
  });

  await test("actions.ts imports buildStartSessionFullDeps", () => {
    const source = readFileSync("src/app/session/actions.ts", "utf-8");
    const hasImport = source.includes("buildStartSessionFullDeps");
    assert(hasImport, "actions.ts must import buildStartSessionFullDeps");
  });

  await test("startSession() calls startSessionFullCore in source", () => {
    const source = readFileSync("src/app/session/actions.ts", "utf-8");
    
    // Extract startSession function body
    const startSessionMatch = source.match(/export async function startSession\(\)[^{]*\{([\s\S]*?)^\}/m);
    assert(!!startSessionMatch, "Could not find startSession function");
    
    const functionBody = startSessionMatch![1];
    
    // Verify it calls startSessionFullCore
    const callsCore = functionBody.includes("startSessionFullCore");
    assert(callsCore, "startSession must call startSessionFullCore in its body");
    
    // Verify it uses buildStartSessionFullDeps
    const usesBuildDeps = functionBody.includes("buildStartSessionFullDeps");
    assert(usesBuildDeps, "startSession must call buildStartSessionFullDeps");
    
    // Verify it doesn't have the old inline implementation markers
    const hasInlineMarkers = functionBody.includes("wave 1") || functionBody.includes("wave 2");
    assert(!hasInlineMarkers, "startSession should not contain old inline 'wave' comments");
  });

  await test("Over-6h stale session from other date is closed before new session", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const OVER_6H_AGO = NOW_MS - (6 * 3600 * 1000 + 1000);
    const STALE_SESSION_STARTED_AT = new Date(OVER_6H_AGO).toISOString();
    const TODAY = "2026-10-26";
    const YESTERDAY = "2026-10-25";

    let staleClosed = false;
    let resumeCalled = false;

    const deps: StartSessionFullDeps = {
      userId: "user-123",
      nowMs: NOW_MS,
      fetchProfile: async () => ({ timezone: "UTC" }),
      fetchOpenSessions: async () => [
        {
          id: "stale-session-id",
          status: "in_progress" as const,
          local_date: YESTERDAY, // Session from different date
          actual_type: "weights" as const,
          started_at: STALE_SESSION_STARTED_AT,
        },
      ],
      fetchResumeEnabled: async () => true,
      updateSession: async () => {
        resumeCalled = true;
        return { ok: true, sessionId: "resumed-session-id" };
      },
      ensureSessionExercises: async () => {},
      ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
      loadProgram: async () => ({
        ok: true,
        program: {
          id: "prog-1",
          started_on: "2026-10-01",
          week_offset: 0,
          deload_week: 4,
        },
        dayId: "day-1",
        dayType: "weights" as const,
      }),
      findInProgressToday: async () => [],
      buildStaleDeps: (openSessions, today) => ({
        today,
        readOpenSessions: async () => openSessions,
        closeStaleSessions: async (sessions) => {
          const staleCount = sessions.filter(s => s.started_at && s.started_at < new Date(NOW_MS - 6 * 3600 * 1000).toISOString()).length;
          if (staleCount > 0) staleClosed = true;
          return staleCount;
        },
        checkRemainingInProgress: async () => ({ ok: true, sessionId: null }),
      }),
      insertSession: async () => ({ ok: true, sessionId: "new-session-id" }),
      fetchPlannedExercises: async () => [],
      insertExercises: async () => ({ ok: true }),
    };

    const result = await startSessionFullCore(deps);

    eq(result.ok, true, "Result should be ok");
    eq(staleClosed, true, "Stale session from other date should be closed before new session");
    eq(resumeCalled, false, "Resume should not be called when stale session is closed");
    eq(result.ok && result.sessionId, "new-session-id", "Should create new session after closing stale");
  });

  await test("Non-stale session is resumed without closing", async () => {
    const NOW_MS = new Date("2026-10-26T20:00:00Z").getTime();
    const RECENT = NOW_MS - (30 * 60 * 1000); // 30 minutes ago
    const SESSION_STARTED_AT = new Date(RECENT).toISOString();
    const TODAY = "2026-10-26";

    let staleClosed = false;
    let resumeCalled = false;

    const deps: StartSessionFullDeps = {
      userId: "user-123",
      nowMs: NOW_MS,
      fetchProfile: async () => ({ timezone: "UTC" }),
      fetchOpenSessions: async () => [
        {
          id: "fresh-session-id",
          status: "in_progress" as const,
          local_date: TODAY,
          actual_type: "weights" as const,
          started_at: SESSION_STARTED_AT,
        },
      ],
      fetchResumeEnabled: async () => true,
      updateSession: async () => {
        resumeCalled = true;
        return { ok: true, sessionId: "fresh-session-id" };
      },
      ensureSessionExercises: async () => {},
      ensureCurrentBlock: async () => ({ status: "current", programId: "prog-1" }),
      loadProgram: async () => ({
        ok: true,
        program: {
          id: "prog-1",
          started_on: "2026-10-01",
          week_offset: 0,
          deload_week: 4,
        },
        dayId: "day-1",
        dayType: "weights" as const,
      }),
      findInProgressToday: async () => [],
      buildStaleDeps: (openSessions, today) => ({
        today,
        readOpenSessions: async () => openSessions,
        closeStaleSessions: async () => {
          staleClosed = true;
          return 0;
        },
        checkRemainingInProgress: async () => ({ ok: true, sessionId: null }),
      }),
      insertSession: async () => ({ ok: true, sessionId: "new-session-id" }),
      fetchPlannedExercises: async () => [],
      insertExercises: async () => ({ ok: true }),
    };

    const result = await startSessionFullCore(deps);

    eq(result.ok, true, "Result should be ok");
    eq(staleClosed, false, "Fresh session should not be closed");
    eq(resumeCalled, true, "Resume should be called for fresh session");
    eq(result.ok && result.sessionId, "fresh-session-id", "Should resume existing session");
  });

  await test("buildStartSessionFullDeps wires Supabase queries correctly", async () => {
    // This is a smoke test that buildStartSessionFullDeps returns the right shape
    const mockSupabase: any = {
      from: () => ({
        select: () => ({ 
          eq: () => ({ 
            single: () => Promise.resolve({ data: null, error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          in: () => ({ order: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      }),
    };

    const deps = buildStartSessionFullDeps(mockSupabase, "user-123", Date.now());

    eq(typeof deps.fetchProfile, "function", "Should have fetchProfile");
    eq(typeof deps.fetchOpenSessions, "function", "Should have fetchOpenSessions");
    eq(typeof deps.fetchResumeEnabled, "function", "Should have fetchResumeEnabled");
    eq(typeof deps.updateSession, "function", "Should have updateSession");
    eq(typeof deps.ensureCurrentBlock, "function", "Should have ensureCurrentBlock");
    eq(typeof deps.buildStaleDeps, "function", "Should have buildStaleDeps");
    eq(typeof deps.userId, "string", "Should have userId");
    eq(typeof deps.nowMs, "number", "Should have nowMs");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
