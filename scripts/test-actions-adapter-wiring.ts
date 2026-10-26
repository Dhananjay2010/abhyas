/**
 * Test that the actions.ts adapter (makePlanDayClient) wires correctly.
 *
 * R-2(a): planDay passes isoWeekday(localDate) into findProgramDay
 * R-1: findDaySessions selects program_day_id and filters by user_id
 *
 *   npx tsx scripts/test-actions-adapter-wiring.ts
 */

import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makePlanDayClient } from "../src/lib/session/make-plan-day-client";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type SessionRow = {
  id: string;
  status: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
  program_day_id?: string | null;
};

type Call = { method: string; args: Array<string | number | unknown> };

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

type SelectBuilder = {
  eq(col: string, val: string): {
    eq(col2: string, val2: string): Promise<{ data: SessionRow[]; error: null }>;
  };
};

type InsertBuilder = Promise<{ data: null; error: null }>;

type UpdateBuilder = {
  eq(col: string, val: string): Promise<{ error: null }>;
};

type DeleteBuilder = {
  in(col: string, vals: string[]): {
    eq(col2: string, val2: string): Promise<{ error: null }>;
  };
};

type FromBuilder = {
  select(cols: string): SelectBuilder;
  insert(row: unknown): InsertBuilder;
  update(row: unknown): UpdateBuilder;
  delete(): DeleteBuilder;
};

function makeFakeDb(): { fakeDb: SupabaseClient<Database>; calls: Call[] } {
  const calls: Call[] = [];
  
  const fakeDb = {
    from(table: string): FromBuilder {
      calls.push({ method: "from", args: [table] });
      
      if (table === "sessions") {
        return {
          select(cols: string) {
            calls.push({ method: "select", args: [cols] });
            return {
              eq(col: string, val: string) {
                calls.push({ method: "eq", args: [col, val] });
                return {
                  eq(col2: string, val2: string) {
                    calls.push({ method: "eq", args: [col2, val2] });
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
          insert(row: unknown) {
            calls.push({ method: "insert", args: [row] });
            return Promise.resolve({ data: null, error: null });
          },
          update(row: unknown) {
            calls.push({ method: "update", args: [row] });
            return {
              eq(col: string, val: string) {
                calls.push({ method: "eq", args: [col, val] });
                return Promise.resolve({ error: null });
              },
            };
          },
          delete() {
            calls.push({ method: "delete", args: [] });
            return {
              in(col: string, vals: string[]) {
                calls.push({ method: "in", args: [col, vals] });
                return {
                  eq(col2: string, val2: string) {
                    calls.push({ method: "eq", args: [col2, val2] });
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
  
  return { fakeDb, calls };
}

async function main() {
  console.log("Testing actions.ts adapter wiring\n");

  await test("findDaySessions selects program_day_id (R-1 regression)", async () => {
    const { fakeDb, calls } = makeFakeDb();
    const client = makePlanDayClient(fakeDb, "user-1");
    
    await client.findDaySessions("2026-11-02");
    
    const selectCall = calls.find((c) => c.method === "select");
    assert(selectCall, "Should call select");
    const selectCols = selectCall.args[0];
    assert(typeof selectCols === "string", "select arg should be string");
    
    assert(
      selectCols.includes("program_day_id"),
      `select must include program_day_id, got: ${selectCols}`
    );
  });

  await test("findDaySessions filters by user_id (R-1 regression)", async () => {
    const { fakeDb, calls } = makeFakeDb();
    const client = makePlanDayClient(fakeDb, "user-123");
    
    await client.findDaySessions("2026-11-02");
    
    const eqCalls = calls.filter((c) => c.method === "eq");
    const userIdEq = eqCalls.find((c) => c.args[0] === "user_id");
    
    assert(userIdEq, "Should filter by user_id");
    assert.equal(userIdEq.args[1], "user-123", "Should use the provided userId");
  });

  await test("rereadDaySessions filters by user_id", async () => {
    const { fakeDb, calls } = makeFakeDb();
    const client = makePlanDayClient(fakeDb, "user-456");
    
    await client.rereadDaySessions("2026-11-02");
    
    const eqCalls = calls.filter((c) => c.method === "eq");
    const userIdEq = eqCalls.find((c) => c.args[0] === "user_id");
    
    assert(userIdEq, "Should filter by user_id");
    assert.equal(userIdEq.args[1], "user-456", "Should use the provided userId");
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
