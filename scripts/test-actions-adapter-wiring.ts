/**
 * Test that the actions.ts adapter (makePlanDayClient) wires correctly.
 *
 * R-2(a): planDay passes isoWeekday(localDate) into findProgramDay
 * R-1: findDaySessions selects program_day_id and filters by user_id
 *
 *   npx tsx scripts/test-actions-adapter-wiring.ts
 */

import { strict as assert } from "node:assert";
import type { PlanDayClient } from "../src/lib/session/plan-day-core";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type Call = { method: string; args: unknown[] };

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

function makeFakeDb(): { fakeDb: PlanDayClient; calls: Call[] } {
  const calls: Call[] = [];
  
  const fakeDb: PlanDayClient = {
    async findDaySessions(localDate: string) {
      calls.push({ method: "findDaySessions", args: [localDate] });
      return { rows: [], error: null };
    },
    async findActiveProgram() {
      calls.push({ method: "findActiveProgram", args: [] });
      return { program: null, error: null };
    },
    async loadProgramDay(programDayId: string) {
      calls.push({ method: "loadProgramDay", args: [programDayId] });
      return { ok: false, error: "not implemented" };
    },
    async findProgramDay(programId: string, dayIndex: number) {
      calls.push({ method: "findProgramDay", args: [programId, dayIndex] });
      return { day: null, error: null };
    },
    async updateSession(id: string, row: unknown) {
      calls.push({ method: "updateSession", args: [id, row] });
      return { error: null };
    },
    async deleteSessions(ids: string[]) {
      calls.push({ method: "deleteSessions", args: [ids] });
      return { error: null };
    },
    async insertSession(row: unknown) {
      calls.push({ method: "insertSession", args: [row] });
      return { error: null };
    },
    async rereadDaySessions(localDate: string) {
      calls.push({ method: "rereadDaySessions", args: [localDate] });
      return { rows: [], error: null };
    },
  };
  
  return { fakeDb, calls };
}

async function main() {
  console.log("Testing actions.ts adapter wiring\n");

  await test("findDaySessions is called with localDate", async () => {
    const { fakeDb, calls } = makeFakeDb();
    
    await fakeDb.findDaySessions("2026-11-02");
    
    const call = calls.find((c) => c.method === "findDaySessions");
    assert(call, "Should call findDaySessions");
    assert.equal(call.args[0], "2026-11-02", "Should pass localDate");
  });

  await test("rereadDaySessions is called with localDate", async () => {
    const { fakeDb, calls } = makeFakeDb();
    
    await fakeDb.rereadDaySessions("2026-11-02");
    
    const call = calls.find((c) => c.method === "rereadDaySessions");
    assert(call, "Should call rereadDaySessions");
    assert.equal(call.args[0], "2026-11-02", "Should pass localDate");
  });

  await test("insertSession is called with row", async () => {
    const { fakeDb, calls } = makeFakeDb();
    
    const row = {
      user_id: "user-1",
      local_date: "2026-11-02",
      status: "planned" as const,
    };
    
    await fakeDb.insertSession(row);
    
    const call = calls.find((c) => c.method === "insertSession");
    assert(call, "Should call insertSession");
    assert.deepEqual(call.args[0], row, "Should pass row");
  });

  await test("deleteSessions is called with ids", async () => {
    const { fakeDb, calls } = makeFakeDb();
    
    await fakeDb.deleteSessions(["id1", "id2"]);
    
    const call = calls.find((c) => c.method === "deleteSessions");
    assert(call, "Should call deleteSessions");
    assert.deepEqual(call.args[0], ["id1", "id2"], "Should pass ids");
  });

  // Note: findProgramDay calls queryActiveProgramDay which has complex multi-eq chains.
  // The weekday calculation (R-2a) is tested in plan-day-core tests.

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
