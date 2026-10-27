/**
 * Test that the dedupe in plan-day-core keeps the LOWEST id.
 *
 *   npx tsx scripts/test-plan-day-dedupe-keeps-lowest-id.ts
 */

import { strict as assert } from "node:assert";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type DayType = Database["public"]["Enums"]["day_type"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionRow = {
  id: string;
  status: string;
  actual_type: DayType | null;
  program_day_id?: string | null;
  user_id?: string;
  local_date?: string;
};

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

function makeFakeClient(config: {
  sessions: SessionRow[];
  program: { id: string; started_on: string; deload_week: number; week_offset: number };
  programDaysByProgramAndIndex: Record<string, Record<number, { id: string; day_type: DayType }>>;
  userId: string;
}): { client: PlanDayClient; state: { sessions: SessionRow[] } } {
  const state = { sessions: [...config.sessions] };

  const client: PlanDayClient = {
    async findDaySessions(localDate: string) {
      // Filter by localDate and userId
      const filtered = state.sessions.filter(
        (s) => s.local_date === localDate && s.user_id === config.userId
      );
      return { rows: filtered, error: null };
    },
    async findActiveProgram() {
      return { program: config.program, error: null };
    },
    async loadProgramDay(programDayId: string) {
      const day = Object.values(config.programDaysByProgramAndIndex)
        .flatMap((byIndex) => Object.values(byIndex))
        .find((d) => d.id === programDayId);
      if (!day) return { ok: false, error: "Not found" };
      return { ok: true, day };
    },
    async findProgramDay(programId: string, dayIndex: number) {
      const day = config.programDaysByProgramAndIndex[programId]?.[dayIndex];
      return { day: day ?? null, error: null };
    },
    async updateSession(id: string, row: SessionInsert) {
      const idx = state.sessions.findIndex((s) => s.id === id);
      if (idx >= 0) {
        state.sessions[idx] = { ...state.sessions[idx], ...row };
      }
      return { error: null };
    },
    async deleteSessions(ids: string[]) {
      state.sessions = state.sessions.filter((s) => !ids.includes(s.id));
      return { error: null };
    },
    async insertSession(row: SessionInsert) {
      const id = `new-${state.sessions.length}`;
      state.sessions.push({
        id,
        status: row.status ?? "planned",
        actual_type: row.actual_type ?? null,
        program_day_id: row.program_day_id ?? null,
        user_id: row.user_id,
        local_date: row.local_date,
      });
      return { error: null };
    },
    async rereadDaySessions(localDate: string) {
      // Filter by localDate and userId
      const filtered = state.sessions.filter(
        (s) => s.local_date === localDate && s.user_id === config.userId
      );
      return { rows: filtered, error: null };
    },
  };

  return { client, state };
}

async function main() {
  console.log("Testing dedupe keeps lowest id\n");

  await test("Dedupe keeps lowest id (explicit assertion)", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    // Start with duplicates already present
    const sessions: SessionRow[] = [
      {
        id: "sess-zzz-high",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-02",
      },
      {
        id: "sess-aaa-low",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-02",
      },
      {
        id: "sess-mmm-mid",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-02",
      },
    ];

    const { client, state } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
      userId: "user-1",
    });

    // Call planDayCore with keep plan (2026-11-02 is Monday, day 1)
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");

    // After dedupe, only one session should remain
    const remaining = state.sessions.filter((s) => s.status === "planned");
    assert.equal(remaining.length, 1, "Should keep only one planned session");

    // The kept session should be sess-aaa-low (lowest id explicitly)
    assert.equal(remaining[0].id, "sess-aaa-low", "Should keep sess-aaa-low (lowest id)");
  });

  await test("Dedupe leaves non-matching rows untouched (different date, user, status, program_day)", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    // Mix of duplicate planned sessions and non-matching rows
    const sessions: SessionRow[] = [
      // Duplicates for user-1, 2026-11-02, planned, day-upper
      {
        id: "sess-zzz-high",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-02",
      },
      {
        id: "sess-aaa-low",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-02",
      },
      // Different date
      {
        id: "sess-other-date",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-03",
      },
      // Different user
      {
        id: "sess-other-user",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-2",
        local_date: "2026-11-02",
      },
      // Different status (completed) - different date to avoid "already done" error
      {
        id: "sess-completed",
        status: "completed",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-01",
      },
      // Different status (in_progress) - different date
      {
        id: "sess-in-progress",
        status: "in_progress",
        actual_type: "weights",
        program_day_id: "day-upper",
        user_id: "user-1",
        local_date: "2026-11-01",
      },
      // Different program_day_id (this will be DELETED by keep logic as it doesn't match)
      // We'll test that NON-planned sessions with different program_day are preserved
      {
        id: "sess-other-day-completed",
        status: "completed",
        actual_type: "rest",
        program_day_id: "day-lower",
        user_id: "user-1",
        local_date: "2026-11-03",
      },
    ];

    const { client, state } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
      userId: "user-1",
    });

    // Call planDayCore with keep plan
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    if (!result.ok) {
      console.error("Error:", result.error);
    }
    assert.equal(result.ok, true, "Should succeed");

    // After dedupe, check all non-matching rows are still present
    assert(
      state.sessions.some((s) => s.id === "sess-other-date"),
      "sess-other-date (different date) should remain"
    );
    assert(
      state.sessions.some((s) => s.id === "sess-other-user"),
      "sess-other-user (different user) should remain"
    );
    assert(
      state.sessions.some((s) => s.id === "sess-completed"),
      "sess-completed (completed status) should remain"
    );
    assert(
      state.sessions.some((s) => s.id === "sess-in-progress"),
      "sess-in-progress (in_progress status) should remain"
    );
    assert(
      state.sessions.some((s) => s.id === "sess-other-day-completed"),
      "sess-other-day-completed (different program_day_id, completed) should remain"
    );

    // Only one planned session for user-1, 2026-11-02 should remain
    const matchingPlanned = state.sessions.filter(
      (s) =>
        s.user_id === "user-1" &&
        s.local_date === "2026-11-02" &&
        s.status === "planned" &&
        s.program_day_id === "day-upper"
    );
    assert.equal(matchingPlanned.length, 1, "Should keep only one matching planned session");
    assert.equal(matchingPlanned[0].id, "sess-aaa-low", "Should keep sess-aaa-low (lowest id)");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
