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
}): { client: PlanDayClient; state: { sessions: SessionRow[] } } {
  const state = { sessions: [...config.sessions] };

  const client: PlanDayClient = {
    async findDaySessions(localDate: string) {
      return { rows: state.sessions, error: null };
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
      });
      return { error: null };
    },
    async rereadDaySessions(localDate: string) {
      return { rows: state.sessions, error: null };
    },
  };

  return { client, state };
}

async function main() {
  console.log("Testing dedupe keeps lowest id\n");

  await test("Dedupe keeps lowest id when reread finds multiple matching rows", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    // Start with no planned sessions (normal case after deletion)
    const sessions: SessionRow[] = [];

    const { client, state } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
    });

    // First call to planDayCore will insert a new session (2026-11-02 is Monday, day 1)
    await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    // Simulate a race: another session was inserted concurrently
    // Insert two more sessions to simulate duplicates from a race
    state.sessions.push(
      { id: "sess-low-1", status: "planned", actual_type: "weights", program_day_id: "day-upper" },
      { id: "sess-mid-2", status: "planned", actual_type: "weights", program_day_id: "day-upper" }
    );

    // Now we have multiple duplicate planned sessions
    // Call planDayCore again, which should trigger the dedupe
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

    // The kept session should have the LOWEST id (lexicographically)
    // It should keep the first one alphabetically
    const ids = state.sessions.map(s => s.id).sort();
    assert.equal(remaining[0].id, ids[0], "Should keep the session with the lowest id");
  });

  await test("Dedupe keeps lowest id comparing lexicographically", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const sessions: SessionRow[] = [];

    const { client, state } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
    });

    // First Keep creates a session (2026-11-02 is Monday, day 1)
    await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    const firstId = state.sessions[0].id;

    // Simulate a race: manually insert more sessions with different ids
    state.sessions.push(
      {
        id: "zzz-last",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
      },
      {
        id: "aaa-first",
        status: "planned",
        actual_type: "weights",
        program_day_id: "day-upper",
      }
    );

    // Second Keep triggers dedupe
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");

    const remaining = state.sessions.filter((s) => s.status === "planned");
    assert.equal(remaining.length, 1, "Should keep only one planned session after dedupe");

    // The kept session should be aaa-first (lowest id lexicographically)
    assert.equal(remaining[0].id, "aaa-first", "Should keep the session with the lowest id");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
