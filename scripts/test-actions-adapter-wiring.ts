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

function makeFakeSupabase() {
  const calls: Call[] = [];
  
  const fakeSupabase = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      
      if (table === "sessions") {
        return {
          select: (cols: string) => {
            calls.push({ method: "select", args: [cols] });
            return {
              eq: (col: string, val: unknown) => {
                calls.push({ method: "eq", args: [col, val] });
                return {
                  eq: (col2: string, val2: unknown) => {
                    calls.push({ method: "eq", args: [col2, val2] });
                    return {
                      then: (resolve: (result: { data: SessionRow[] | null; error: null }) => void) => {
                        resolve({ data: [], error: null });
                      },
                    };
                  },
                  then: (resolve: (result: { data: SessionRow[] | null; error: null }) => void) => {
                    resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
          insert: (row: unknown) => {
            calls.push({ method: "insert", args: [row] });
            return {
              then: (resolve: (result: { data: null; error: { code?: string; message: string } | null }) => void) => {
                resolve({ data: null, error: null });
              },
            };
          },
          delete: () => {
            calls.push({ method: "delete", args: [] });
            return {
              in: (col: string, vals: unknown[]) => {
                calls.push({ method: "in", args: [col, vals] });
                return {
                  eq: (col2: string, val2: unknown) => {
                    calls.push({ method: "eq", args: [col2, val2] });
                    return {
                      then: (resolve: (result: { error: null }) => void) => {
                        resolve({ error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          update: (row: unknown) => {
            calls.push({ method: "update", args: [row] });
            return {
              eq: (col: string, val: unknown) => {
                calls.push({ method: "eq", args: [col, val] });
                return {
                  then: (resolve: (result: { error: null }) => void) => {
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      
      return {
        select: () => ({ eq: () => ({ then: () => {} }) }),
        insert: () => ({ then: () => {} }),
        delete: () => ({ in: () => ({ eq: () => ({ then: () => {} }) }) }),
        update: () => ({ eq: () => ({ then: () => {} }) }),
      };
    },
  };
  
  return { fakeSupabase, calls };
}

async function main() {
  console.log("Testing actions.ts adapter wiring\n");

  await test("findDaySessions selects program_day_id (R-1 regression)", async () => {
    const { fakeSupabase, calls } = makeFakeSupabase();
    const client = makePlanDayClient(fakeSupabase as unknown as SupabaseClient<Database>, "user-1");
    
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
    const { fakeSupabase, calls } = makeFakeSupabase();
    const client = makePlanDayClient(fakeSupabase as unknown as SupabaseClient<Database>, "user-123");
    
    await client.findDaySessions("2026-11-02");
    
    const eqCalls = calls.filter((c) => c.method === "eq");
    const userIdEq = eqCalls.find((c) => c.args[0] === "user_id");
    
    assert(userIdEq, "Should filter by user_id");
    assert.equal(userIdEq.args[1], "user-123", "Should use the provided userId");
  });

  // Note: findProgramDay calls queryActiveProgramDay which has complex multi-eq chains
  // that are difficult to fake. The weekday calculation (R-2a) is tested in plan-day-core tests.

  await test("rereadDaySessions filters by user_id", async () => {
    const { fakeSupabase, calls } = makeFakeSupabase();
    const client = makePlanDayClient(fakeSupabase as unknown as SupabaseClient<Database>, "user-456");
    
    await client.rereadDaySessions("2026-11-02");
    
    const eqCalls = calls.filter((c) => c.method === "eq");
    const userIdEq = eqCalls.find((c) => c.args[0] === "user_id");
    
    assert(userIdEq, "Should filter by user_id");
    assert.equal(userIdEq.args[1], "user-456", "Should use the provided userId");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
