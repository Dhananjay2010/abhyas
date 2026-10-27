/**
 * Test: startSessionFullCore behavioral collision resolution (mutants A & B)
 * 
 * Tests that startSessionFullCore uses resolveTodayDay and loadProgramDay
 * when collision is detected (yesterday Rest-swap → today collision).
 * 
 * Mutants:
 * (A) In start-session-full-core.ts, resolved branch calls loadProgram(programId, dayIndex)
 *     instead of loadProgramDay(..., resolvedDay.programDayId) → test fails
 * (B) buildStartSessionFullDeps.resolveTodayDay returns null → test fails
 * 
 * Run: npx tsx scripts/test-start-session-full-core-collision.ts
 */

import { strict as assert } from "node:assert";
import { startSessionFullCore } from "../src/lib/session/start-session-full-core";
import type { StartSessionFullDeps, OpenSession } from "../src/lib/session/start-session-full-core";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

const WEIGHTS: DayType = "weights";
const REST: DayType = "rest";

async function main() {
  console.log("Test: startSessionFullCore collision resolution (mutants A & B)\n");

  console.log("1. Collision: resolveTodayDay returns Upper, loadProgramDay called with upper-id");
  {
    let resolveTodayDayCalled = false;
    let loadProgramDayCalled = false;
    let loadProgramDayCalledWith: string | null = null;
    let loadProgramCalled = false;

    const deps: StartSessionFullDeps = {
      userId: "test-user",
      nowMs: Date.parse("2024-03-05T10:00:00Z"),

      async fetchProfile() {
        return { timezone: "America/New_York" };
      },

      async fetchOpenSessions(): Promise<OpenSession[]> {
        return [];
      },

      async fetchResumeEnabled() {
        return false;
      },

      async updateSession() {
        return { ok: true as const, sessionId: "sid" };
      },

      async ensureSessionExercises() {},

      buildStaleDeps() {
        return {} as any;
      },

      async ensureCurrentBlock() {
        return { status: "current" as const, programId: "prog-id" };
      },

      async resolveTodayDay(programId: string, today: string) {
        resolveTodayDayCalled = true;
        // Simulate collision resolution returning Upper
        return { programDayId: "upper-id", dayType: WEIGHTS, label: "Upper" };
      },

      async loadProgram(programId: string, dayIndex: number) {
        loadProgramCalled = true;
        return { ok: false as const, error: "Should not call loadProgram when resolveTodayDay returns a result" };
      },

      async loadProgramDay(programId: string, programDayId: string) {
        loadProgramDayCalled = true;
        loadProgramDayCalledWith = programDayId;
        return {
          ok: true as const,
          program: { id: programId, started_on: "2024-03-01", deload_week: 4, week_offset: 0 },
          dayId: programDayId,
          dayType: WEIGHTS,
        };
      },

      async findInProgressToday() {
        return [];
      },

      async insertSession(payload: SessionInsert) {
        return { ok: true as const, sessionId: "session-id" };
      },

      async fetchPlannedExercises() {
        return [];
      },

      async insertExercises() {
        return { ok: true as const };
      },
    };

    const result = await startSessionFullCore(deps);

    assert.ok(result.ok, "startSessionFullCore should succeed");
    assert.ok(resolveTodayDayCalled, "Must call resolveTodayDay");
    assert.ok(loadProgramDayCalled, "Must call loadProgramDay (not loadProgram) when resolveTodayDay returns a result");
    assert.equal(loadProgramDayCalledWith, "upper-id", "Must call loadProgramDay with collision-resolved programDayId (upper-id)");
    assert.ok(!loadProgramCalled, "Must NOT call loadProgram when resolveTodayDay returns a result");

    console.log("  ✓ resolveTodayDay called");
    console.log("  ✓ loadProgramDay called with upper-id (collision-resolved)");
    console.log("  ✓ loadProgram NOT called");
  }

  console.log("\n2. No collision: resolveTodayDay returns null, loadProgram called");
  {
    let resolveTodayDayCalled = false;
    let loadProgramDayCalled = false;
    let loadProgramCalled = false;
    let loadProgramCalledWithDayIndex: number | null = null;

    const deps: StartSessionFullDeps = {
      userId: "test-user",
      nowMs: Date.parse("2024-03-05T10:00:00Z"),

      async fetchProfile() {
        return { timezone: "America/New_York" };
      },

      async fetchOpenSessions(): Promise<OpenSession[]> {
        return [];
      },

      async fetchResumeEnabled() {
        return false;
      },

      async updateSession() {
        return { ok: true as const, sessionId: "sid" };
      },

      async ensureSessionExercises() {},

      buildStaleDeps() {
        return {} as any;
      },

      async ensureCurrentBlock() {
        return { status: "current" as const, programId: "prog-id" };
      },

      async resolveTodayDay(programId: string, today: string) {
        resolveTodayDayCalled = true;
        // No collision
        return null;
      },

      async loadProgram(programId: string, dayIndex: number) {
        loadProgramCalled = true;
        loadProgramCalledWithDayIndex = dayIndex;
        return {
          ok: true as const,
          program: { id: programId, started_on: "2024-03-01", deload_week: 4, week_offset: 0 },
          dayId: "lower-id",
          dayType: WEIGHTS,
        };
      },

      async loadProgramDay(programId: string, programDayId: string) {
        loadProgramDayCalled = true;
        return { ok: false as const, error: "Should not call loadProgramDay when resolveTodayDay returns null" };
      },

      async findInProgressToday() {
        return [];
      },

      async insertSession(payload: SessionInsert) {
        return { ok: true as const, sessionId: "session-id" };
      },

      async fetchPlannedExercises() {
        return [];
      },

      async insertExercises() {
        return { ok: true as const };
      },
    };

    const result = await startSessionFullCore(deps);

    assert.ok(result.ok, "startSessionFullCore should succeed");
    assert.ok(resolveTodayDayCalled, "Must call resolveTodayDay");
    assert.ok(loadProgramCalled, "Must call loadProgram when resolveTodayDay returns null");
    assert.equal(loadProgramCalledWithDayIndex, 2, "Must call loadProgram with dayIndex=2 (Tuesday)");
    assert.ok(!loadProgramDayCalled, "Must NOT call loadProgramDay when resolveTodayDay returns null");

    console.log("  ✓ resolveTodayDay called");
    console.log("  ✓ loadProgram called with dayIndex=2");
    console.log("  ✓ loadProgramDay NOT called");
  }

  console.log("\n✅ All startSessionFullCore collision tests passed");
  console.log("  ✓ Collision: loadProgramDay(upper-id) called, loadProgram NOT called");
  console.log("  ✓ No collision: loadProgram(dayIndex) called, loadProgramDay NOT called");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
