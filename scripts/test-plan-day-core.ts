/**
 * Test planDayCore pure logic with typed recording fake.
 *
 *   npx tsx scripts/test-plan-day-core.ts
 */

import { strict as assert } from "node:assert";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type DayType = Database["public"]["Enums"]["day_type"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionRow = { id: string; status: string; actual_type: DayType | null };
type Program = {
  id: string;
  started_on: string;
  deload_week: number;
  week_offset: number;
};
type ProgramDay = {
  id: string;
  day_type: DayType;
};

type Call =
  | { method: "findDaySessions"; localDate: string }
  | { method: "findActiveProgram" }
  | { method: "loadProgramDay"; programDayId: string }
  | { method: "updateSession"; id: string; row: SessionInsert }
  | { method: "deleteSessions"; ids: string[] }
  | { method: "insertSession"; row: SessionInsert };

function makeFakeClient(config: {
  existingSessions?: SessionRow[];
  program?: Program | null;
  programDays?: Record<string, ProgramDay>;
}): { client: PlanDayClient; calls: Call[] } {
  const calls: Call[] = [];

  const client: PlanDayClient = {
    async findDaySessions(localDate: string) {
      calls.push({ method: "findDaySessions", localDate });
      return {
        rows: config.existingSessions ?? [],
        error: null,
      };
    },
    async findActiveProgram() {
      calls.push({ method: "findActiveProgram" });
      return {
        program: config.program ?? null,
        error: null,
      };
    },
    async loadProgramDay(programDayId: string) {
      calls.push({ method: "loadProgramDay", programDayId });
      const day = config.programDays?.[programDayId];
      if (!day) {
        return { ok: false, error: "Program day not found." };
      }
      return { ok: true, day };
    },
    async updateSession(id: string, row: SessionInsert) {
      calls.push({ method: "updateSession", id, row });
      return { error: null };
    },
    async deleteSessions(ids: string[]) {
      calls.push({ method: "deleteSessions", ids });
      return { error: null };
    },
    async insertSession(row: SessionInsert) {
      calls.push({ method: "insertSession", row });
      return { error: null };
    },
  };

  return { client, calls };
}

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

async function main() {
  console.log("Testing planDayCore\n");

  await test("(a) Training on bodyweight program day writes bodyweight + all fields", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-bw",
      day_type: "bodyweight",
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
      programDays: { "day-bw": programDay },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "training", programDayId: "day-bw" },
    });

    assert.equal(result.ok, true, "Should succeed");
    assert.equal(calls.length, 4, "Should make 4 calls");
    assert.equal(calls[0].method, "findDaySessions");
    assert.equal(calls[1].method, "findActiveProgram");
    assert.equal(calls[2].method, "loadProgramDay");
    if (calls[2].method !== "loadProgramDay") throw new Error("Wrong call");
    assert.equal(calls[2].programDayId, "day-bw");
    assert.equal(calls[3].method, "insertSession");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(insertCall, "Should insert a session");
    if (insertCall.method !== "insertSession") throw new Error("Wrong call");

    assert.equal(insertCall.row.actual_type, "bodyweight", "Should be bodyweight");
    assert.equal(insertCall.row.planned_type, "bodyweight", "planned_type should be bodyweight");
    assert.equal(insertCall.row.program_day_id, "day-bw", "Should have program_day_id");
    assert.equal(insertCall.row.program_id, "prog-1", "Should have program_id");
    assert.equal(insertCall.row.week_in_block, 3, "Week 3 for 2026-11-15 from 2026-11-01");
    assert.equal(insertCall.row.is_deload, false, "Week 3 is not deload week");
  });

  await test("(a2) Deload week writes is_deload: true", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 3,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-weights",
      day_type: "weights",
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
      programDays: { "day-weights": programDay },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "training", programDayId: "day-weights" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const insertCall = calls.find((c) => c.method === "insertSession");
    if (insertCall?.method !== "insertSession") throw new Error("Wrong call");
    assert.equal(insertCall.row.is_deload, true, "Week 3 is deload week");
  });

  await test("(b) With 2 existing planned rows: updates first, deletes second", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-push",
      day_type: "weights",
    };

    const existing: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "rest" },
      { id: "sess-2", status: "planned", actual_type: "weights" },
    ];

    const { client, calls } = makeFakeClient({
      existingSessions: existing,
      program,
      programDays: { "day-push": programDay },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "training", programDayId: "day-push" },
    });

    assert.equal(result.ok, true, "Should succeed");

    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(deleteCall, "Should delete second row");
    if (deleteCall.method !== "deleteSessions") throw new Error("Wrong call");
    assert.deepEqual(deleteCall.ids, ["sess-2"], "Should delete sess-2");

    const updateCall = calls.find((c) => c.method === "updateSession");
    assert(updateCall, "Should update first row");
    if (updateCall.method !== "updateSession") throw new Error("Wrong call");
    assert.equal(updateCall.id, "sess-1", "Should update sess-1");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(!insertCall, "Should NOT insert when updating");
  });

  await test("(c) Yoga writes 'yoga' with program week stamped", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "yoga" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const insertCall = calls.find((c) => c.method === "insertSession");
    if (insertCall?.method !== "insertSession") throw new Error("Wrong call");

    assert.equal(insertCall.row.actual_type, "yoga", "Should be yoga");
    assert.equal(insertCall.row.planned_type, "yoga", "planned_type should be yoga");
    assert.equal(insertCall.row.program_id, "prog-1", "Should have program_id");
    assert.equal(insertCall.row.week_in_block, 3, "Should stamp week");
  });

  await test("(d) Breathing writes 'meditation' with program week stamped", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "breathing" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const insertCall = calls.find((c) => c.method === "insertSession");
    if (insertCall?.method !== "insertSession") throw new Error("Wrong call");

    assert.equal(insertCall.row.actual_type, "meditation", "Should be meditation");
    assert.equal(insertCall.row.planned_type, "meditation", "planned_type should be meditation");
    assert.equal(insertCall.row.program_id, "prog-1", "Should have program_id");
    assert.equal(insertCall.row.week_in_block, 3, "Should stamp week");
  });

  await test("(e) Unknown programDayId returns loadPlanDay error", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
      programDays: {}, // No program days available
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "training", programDayId: "day-unknown" },
    });

    assert.equal(result.ok, false, "Should fail");
    assert.equal(result.ok === false && result.error, "Program day not found.");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(!insertCall, "Should NOT insert on error");
  });

  await test("Past date returns error", async () => {
    const { client } = makeFakeClient({});

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-10",
      today: "2026-11-14",
      plan: { kind: "rest" },
    });

    assert.equal(result.ok, false, "Should fail");
    assert.equal(result.ok === false && result.error, "That day has already been and gone.");
  });

  await test("Completed day returns error", async () => {
    const existing: SessionRow[] = [
      { id: "sess-1", status: "completed", actual_type: "weights" },
    ];

    const { client } = makeFakeClient({ existingSessions: existing });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "rest" },
    });

    assert.equal(result.ok, false, "Should fail");
    assert.equal(result.ok === false && result.error, "That day is already done.");
  });

  await test("Keep with no planned rows: no-op", async () => {
    const { client, calls } = makeFakeClient({ existingSessions: [] });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(!deleteCall, "Should NOT delete when no planned rows");
  });

  await test("Keep with 2 rest rows: deleteSessions NOT called", async () => {
    const existing: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "rest" },
      { id: "sess-2", status: "planned", actual_type: "rest" },
    ];

    const { client, calls } = makeFakeClient({ existingSessions: existing });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(!deleteCall, "Should NOT delete all-rest rows");
  });

  await test("Keep with 1 yoga row: deleteSessions called", async () => {
    const existing: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "yoga" },
    ];

    const { client, calls } = makeFakeClient({ existingSessions: existing });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(deleteCall, "Should delete yoga row");
    if (deleteCall.method !== "deleteSessions") throw new Error("Wrong call");
    assert.deepEqual(deleteCall.ids, ["sess-1"], "Should delete sess-1");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

