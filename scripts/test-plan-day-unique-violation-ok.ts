/**
 * Test that a unique violation (23505) on planned sessions is handled as already kept.
 *
 *   npx tsx scripts/test-plan-day-unique-violation-ok.ts
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
  simulateUniqueViolation?: boolean;
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
      // Simulate unique violation on planned sessions per user_id, local_date
      if (config.simulateUniqueViolation) {
        // Check if a planned session already exists for this date
        const existing = state.sessions.find(
          (s) => s.status === "planned" && row.status === "planned"
        );
        if (existing) {
          // Return error with code 23505 (unique violation)
          const error = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
          error.code = "23505";
          return { error: error.message };
        }
      }

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
  console.log("Testing unique violation handling\n");

  await test("Unique violation (23505) is treated as already kept (success)", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    // Start with an existing planned session
    const sessions: SessionRow[] = [
      { id: "sess-existing", status: "planned", actual_type: "weights", program_day_id: "day-upper" },
    ];

    // The client will simulate a unique violation on insert
    const { client } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
      simulateUniqueViolation: true,
    });

    // A second Keep attempt should succeed (no duplicate created)
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should treat unique violation as success");
  });

  await test("No error when matching row already exists (dedupe path)", async () => {
    const day = { id: "day-upper", day_type: "weights" as const };
    const program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const sessions: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "weights", program_day_id: "day-upper" },
    ];

    const { client, state } = makeFakeClient({
      sessions,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 1: day } },
    });

    // A second Keep with a matching row should succeed
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed when matching row exists");
    
    // Should still have exactly one planned session
    const planned = state.sessions.filter((s) => s.status === "planned");
    assert.equal(planned.length, 1, "Should have exactly one planned session");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
