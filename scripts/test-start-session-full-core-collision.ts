#!/usr/bin/env tsx
/**
 * Test: startSessionFullCore uses loadProgramDay when resolveTodayDay returns result (mutant A)
 * 
 * Mutant (A): In start-session-full-core.ts, if the resolved branch calls
 * loadProgram(programId, dayIndex) instead of loadProgramDay(..., resolvedDay.programDayId),
 * this test FAILS because it asserts loadProgramDay received the rotated ID.
 */

import { strict as assert } from "node:assert";
import { startSessionFullCore } from "../src/lib/session/start-session-full-core";
import type { StartSessionFullDeps } from "../src/lib/session/start-session-full-core";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

const WEIGHTS: DayType = "weights";

let loadProgramCalls: Array<{ programId: string; dayIndex: number }> = [];
let loadProgramDayCalls: Array<{ programId: string; programDayId: string }> = [];

// Build fake deps with tracking
function makeFakeDeps(resolvedDayId: string | null): StartSessionFullDeps {
  return {
    userId: "user-456",
    nowMs: Date.now(),
    
    fetchProfile: async () => ({ timezone: "UTC" }),
    fetchOpenSessions: async () => [],
    fetchResumeEnabled: async () => false,
    
    updateSession: async () => ({ ok: true, sessionId: "sess-123" }),
    ensureSessionExercises: async () => {},
    
    ensureCurrentBlock: async () => ({ status: "current", programId: "prog-123" }),
    
    resolveTodayDay: async () =>
      resolvedDayId
        ? { programDayId: resolvedDayId, dayType: WEIGHTS, label: "Push" }
        : null,
    
    loadProgram: async (programId: string, dayIndex: number) => {
      loadProgramCalls.push({ programId, dayIndex });
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-20", deload_week: 3, week_offset: 0 },
        dayId: "weekday-day-id",
        dayType: WEIGHTS,
      };
    },
    
    loadProgramDay: async (programId: string, programDayId: string) => {
      loadProgramDayCalls.push({ programId, programDayId });
      return {
        ok: true,
        program: { id: programId, started_on: "2026-10-20", deload_week: 3, week_offset: 0 },
        dayId: programDayId,
        dayType: WEIGHTS,
      };
    },
    
    findInProgressToday: async () => [],
    buildStaleDeps: () => ({
      readOpenSessions: async () => [],
      checkStale: async () => false,
      updateStale: async () => ({ ok: true }),
    }),
    insertSession: async () => ({ ok: true, sessionId: "sess-123" }),
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
  };
}

(async () => {
  console.log("Test: startSessionFullCore collision resolution (mutant A)\n");

  console.log("1. When resolveTodayDay returns rotated ID, loadProgramDay must be called with it");
  {
    loadProgramCalls = [];
    loadProgramDayCalls = [];

    const deps = makeFakeDeps("rotated-day-123");
    const result = await startSessionFullCore(deps);

    if (!result.ok) {
      console.log(`    Error: ${result.error}`);
    }
    assert.ok(result.ok, "startSessionFullCore should succeed");
    assert.strictEqual(loadProgramCalls.length, 0, "loadProgram should NOT be called");
    assert.strictEqual(loadProgramDayCalls.length, 1, "loadProgramDay should be called once");
    assert.strictEqual(
      loadProgramDayCalls[0]?.programDayId,
      "rotated-day-123",
      "loadProgramDay must receive the resolved rotated ID"
    );

    console.log("  ✓ Collision path: loadProgramDay(rotated-day-123) called");
  }

  console.log("\n2. When resolveTodayDay returns null, loadProgram must be called");
  {
    loadProgramCalls = [];
    loadProgramDayCalls = [];

    const deps = makeFakeDeps(null);
    const result = await startSessionFullCore(deps);

    assert.ok(result.ok, "startSessionFullCore should succeed");
    assert.strictEqual(loadProgramDayCalls.length, 0, "loadProgramDay should NOT be called");
    assert.strictEqual(loadProgramCalls.length, 1, "loadProgram should be called once");

    console.log("  ✓ Normal path: loadProgram(weekdayIndex) called");
  }

  console.log("\n✅ Mutant A would fail: switching loadProgramDay → loadProgram breaks test 1");
})().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});

export {};
