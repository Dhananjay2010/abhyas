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
type SessionRow = {
  id: string;
  status: string;
  actual_type: DayType | null;
  program_day_id?: string | null;
};
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
  | { method: "findProgramDay"; programId: string; dayIndex: number }
  | { method: "updateSession"; id: string; row: SessionInsert }
  | { method: "deleteSessions"; ids: string[] }
  | { method: "insertSession"; row: SessionInsert }
  | { method: "rereadDaySessions"; localDate: string };

function makeFakeClient(config: {
  existingSessions?: SessionRow[];
  program?: Program | null;
  programDays?: Record<string, ProgramDay>;
  programDaysByProgramAndIndex?: Record<string, Record<number, ProgramDay>>;
  insertedSessions?: SessionRow[];
}): { client: PlanDayClient; calls: Call[]; state: { sessions: SessionRow[] } } {
  const calls: Call[] = [];
  const state = { sessions: [...(config.existingSessions ?? [])] };

  const client: PlanDayClient = {
    async findDaySessions(localDate: string) {
      calls.push({ method: "findDaySessions", localDate });
      return {
        rows: state.sessions.filter((s) => {
          const ld = (s as { local_date?: string }).local_date;
          return ld === undefined || ld === localDate;
        }),
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
    async findProgramDay(programId: string, dayIndex: number) {
      calls.push({ method: "findProgramDay", programId, dayIndex });
      const day = config.programDaysByProgramAndIndex?.[programId]?.[dayIndex];
      return { day: day ?? null, error: null };
    },
    async updateSession(id: string, row: SessionInsert) {
      calls.push({ method: "updateSession", id, row });
      const idx = state.sessions.findIndex((s) => s.id === id);
      if (idx >= 0) {
        state.sessions[idx] = { ...state.sessions[idx], ...row };
      }
      return { error: null };
    },
    async deleteSessions(ids: string[]) {
      calls.push({ method: "deleteSessions", ids });
      state.sessions = state.sessions.filter((s) => !ids.includes(s.id));
      return { error: null };
    },
    async insertSession(row: SessionInsert) {
      calls.push({ method: "insertSession", row });
      const id = `sess-${state.sessions.length + 1}`;
      state.sessions.push({
        id,
        status: row.status ?? "planned",
        actual_type: row.actual_type ?? null,
        program_day_id: row.program_day_id ?? null,
        local_date: row.local_date,
      } as SessionRow & { local_date: string });
      return { error: null };
    },
    async rereadDaySessions(localDate: string) {
      calls.push({ method: "rereadDaySessions", localDate });
      return {
        rows: state.sessions.filter((s) => (s as { local_date?: string }).local_date === localDate),
        error: null,
      };
    },
  };

  return { client, calls, state };
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

  await test("Keep with no planned rows: writes today's planned row with template day type", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: programDay } },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");
    
    const findProgramDayCall = calls.find((c) => c.method === "findProgramDay");
    assert(findProgramDayCall, "Should call findProgramDay");
    if (findProgramDayCall.method !== "findProgramDay") throw new Error("Wrong call");
    assert.equal(findProgramDayCall.programId, "prog-1", "Should pass active program id");
    assert.equal(findProgramDayCall.dayIndex, 7, "2026-11-15 is Sunday, isoWeekday = 7");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(insertCall, "Should insert a session");
    if (insertCall.method !== "insertSession") throw new Error("Wrong call");

    assert.equal(insertCall.row.actual_type, "weights", "Should be weights");
    assert.equal(insertCall.row.planned_type, "weights", "planned_type should be weights");
    assert.equal(insertCall.row.program_day_id, "day-upper", "Should have program_day_id");
    assert.equal(insertCall.row.program_id, "prog-1", "Should have program_id");
    assert.equal(insertCall.row.week_in_block, 3, "Week 3 for 2026-11-15 from 2026-11-01");
    assert.equal(insertCall.row.status, "planned", "Should be planned");
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

  await test("Keep with 1 yoga row: deleteSessions called, inserts template row", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-weights",
      day_type: "weights",
    };

    const existing: SessionRow[] = [{ id: "sess-1", status: "planned", actual_type: "yoga", program_day_id: null }];

    const { client, calls } = makeFakeClient({
      existingSessions: existing,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: programDay } },
    });

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

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(insertCall, "Should insert template row");
  });

  await test("Keep on a Rest day (Monday): writes Rest planned row", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-rest",
      day_type: "rest",
    };

    const { client, calls } = makeFakeClient({
      existingSessions: [],
      program,
      programDaysByProgramAndIndex: { "prog-1": { 2: programDay } },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-17",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");

    const findProgramDayCall = calls.find((c) => c.method === "findProgramDay");
    assert(findProgramDayCall, "Should call findProgramDay");
    if (findProgramDayCall.method !== "findProgramDay") throw new Error("Wrong call");
    assert.equal(findProgramDayCall.programId, "prog-1", "Should pass active program id");
    assert.equal(findProgramDayCall.dayIndex, 2, "2026-11-17 is Tuesday, isoWeekday = 2");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(insertCall, "Should insert a session");
    if (insertCall.method !== "insertSession") throw new Error("Wrong call");

    assert.equal(insertCall.row.actual_type, "rest", "Should be rest");
    assert.equal(insertCall.row.planned_type, "rest", "planned_type should be rest");
    assert.equal(insertCall.row.status, "planned", "Should be planned");
  });

  await test("Keep when findProgramDay returns null: returns error and inserts nothing", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };

    const existing: SessionRow[] = [{ id: "sess-1", status: "planned", actual_type: "weights", program_day_id: null }];

    const { client, calls } = makeFakeClient({
      existingSessions: existing,
      program,
      programDaysByProgramAndIndex: { "prog-1": {} },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, false, "Should fail");
    assert.equal(result.ok === false && result.error, "Could not find program day.");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(!insertCall, "Should NOT insert when program day not found");
  });

  await test("Keep when planned row matches template: keeps it, no insert", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-weights",
      day_type: "weights",
    };

    const existing: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "weights", program_day_id: "day-weights" },
    ];

    const { client, calls, state } = makeFakeClient({
      existingSessions: existing,
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: programDay } },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");

    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(!deleteCall, "Should NOT delete when row matches");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(!insertCall, "Should NOT insert when row already matches");

    assert.equal(state.sessions.length, 1, "Should still have 1 session");
    assert.equal(state.sessions[0].id, "sess-1", "Should keep the existing session");
  });

  await test("Keep twice (idempotent): first inserts, second keeps existing row", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };

    const { client, calls, state } = makeFakeClient({
      existingSessions: [],
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: programDay } },
    });

    state.sessions = state.sessions.map((s) => ({ ...s, local_date: "2026-11-15" } as SessionRow & { local_date: string }));

    const result1 = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });
    assert.equal(result1.ok, true, "First Keep should succeed");
    assert.equal(state.sessions.filter((s) => s.status === "planned").length, 1, "Should have 1 planned row after first Keep");

    const result2 = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });
    assert.equal(result2.ok, true, "Second Keep should succeed");
    assert.equal(state.sessions.filter((s) => s.status === "planned").length, 1, "Should still have 1 planned row after second Keep");

    const secondKeepDeletes = calls.filter((c) => c.method === "deleteSessions" && calls.indexOf(c) > calls.findIndex((c2) => c2.method === "insertSession"));
    assert.equal(secondKeepDeletes.length, 0, "Second Keep should not delete anything");
  });

  await test("Keep with matching row plus duplicate: keeps lowest id", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const programDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };

    const existing: SessionRow[] = [
      { id: "sess-3", status: "planned", actual_type: "weights", program_day_id: "day-upper" },
      { id: "sess-1", status: "planned", actual_type: "weights", program_day_id: "day-upper" },
    ];

    const { client, calls, state } = makeFakeClient({
      existingSessions: existing.map((s) => ({ ...s, local_date: "2026-11-15" } as SessionRow & { local_date: string })),
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: programDay } },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");
    const remaining = state.sessions.filter((s) => s.status === "planned");
    assert.equal(remaining.length, 1, "Should have 1 planned row");
    assert.equal(remaining[0].id, "sess-1", "Should keep the lowest id (sess-1)");

    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(deleteCall, "Should delete the duplicate");
    if (deleteCall.method !== "deleteSessions") throw new Error("Wrong call");
    assert.deepEqual(deleteCall.ids, ["sess-3"], "Should delete sess-3");
  });

  await test("Keep with swapped override row: deletes it and inserts template row", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const upperDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };
    const lowerDay: ProgramDay = {
      id: "day-lower",
      day_type: "weights",
    };

    const existing: SessionRow[] = [
      { id: "sess-1", status: "planned", actual_type: "weights", program_day_id: "day-lower" },
    ];

    const { client, calls, state } = makeFakeClient({
      existingSessions: existing.map((s) => ({ ...s, local_date: "2026-11-15" } as SessionRow & { local_date: string })),
      program,
      programDaysByProgramAndIndex: { "prog-1": { 7: upperDay, 6: lowerDay } },
    });

    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });

    assert.equal(result.ok, true, "Should succeed");

    const deleteCall = calls.find((c) => c.method === "deleteSessions");
    assert(deleteCall, "Should delete the swapped row");
    if (deleteCall.method !== "deleteSessions") throw new Error("Wrong call");
    assert.deepEqual(deleteCall.ids, ["sess-1"], "Should delete sess-1 (the override)");

    const insertCall = calls.find((c) => c.method === "insertSession");
    assert(insertCall, "Should insert template row");
    if (insertCall.method !== "insertSession") throw new Error("Wrong call");
    assert.equal(insertCall.row.program_day_id, "day-upper", "Should insert day-upper");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

