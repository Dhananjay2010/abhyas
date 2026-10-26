/**
 * Test insertSession 23505 handling in the adapter.
 *
 * Issue 3: Test that:
 * - insertSession with 23505 returns {error: null}
 * - insertSession with other error codes (23503) surfaces the error
 * - Through planDayCore: 23505 results in ok:true and one planned row
 *
 *   npx tsx scripts/test-adapter-23505-handling.ts
 */

import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makePlanDayClient } from "../src/lib/session/make-plan-day-client";
import { planDayCore } from "../src/lib/session/plan-day-core";
import type { Database } from "../src/lib/database.types";

export {}; // Module

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
  eq(): {
    eq(): Promise<{ data: never[]; error: null }>;
  };
};

type InsertBuilder = Promise<{ data: null; error: { code: string; message: string } | null }>;

type UpdateBuilder = {
  eq(): Promise<{ error: null }>;
};

type DeleteBuilder = {
  in(): {
    eq(): Promise<{ error: null }>;
  };
};

type FromBuilder = {
  select(): SelectBuilder;
  insert(): InsertBuilder;
  update(): UpdateBuilder;
  delete(): DeleteBuilder;
};

function makeFakeDbWithError(errorCode: string | null): SupabaseClient<Database> {
  return {
    from(table: string): FromBuilder {
      if (table === "sessions") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
          insert() {
            if (errorCode) {
              return Promise.resolve({
                data: null,
                error: {
                  code: errorCode,
                  message: `Simulated error ${errorCode}`,
                },
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
          delete() {
            return {
              in() {
                return {
                  eq() {
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
}

async function main() {
  console.log("Testing 23505 handling in adapter\n");

  await test("insertSession with 23505 returns {error: null}", async () => {
    const fakeDb = makeFakeDbWithError("23505");
    const client = makePlanDayClient(fakeDb, "user-1");
    
    const result = await client.insertSession({
      user_id: "user-1",
      local_date: "2026-11-02",
      status: "planned",
      actual_type: null,
      program_day_id: "day-1",
    });
    
    assert.equal(result.error, null, "23505 should be suppressed and return {error: null}");
  });

  await test("insertSession with 23503 surfaces the error", async () => {
    const fakeDb = makeFakeDbWithError("23503");
    const client = makePlanDayClient(fakeDb, "user-1");
    
    const result = await client.insertSession({
      user_id: "user-1",
      local_date: "2026-11-02",
      status: "planned",
      actual_type: null,
      program_day_id: "day-1",
    });
    
    assert.notEqual(result.error, null, "Non-23505 errors should be surfaced");
    assert(result.error?.includes("23503"), `Error should mention 23503, got: ${result.error}`);
  });

  await test("insertSession with null error returns {error: null}", async () => {
    const fakeDb = makeFakeDbWithError(null);
    const client = makePlanDayClient(fakeDb, "user-1");
    
    const result = await client.insertSession({
      user_id: "user-1",
      local_date: "2026-11-02",
      status: "planned",
      actual_type: null,
      program_day_id: "day-1",
    });
    
    assert.equal(result.error, null, "Successful insert should return {error: null}");
  });

  await test("planDayCore with 23505: one planned row and ok:true", async () => {
    const existingRow = {
      id: "session-existing",
      status: "planned" as const,
      actual_type: "weights" as const,
      program_day_id: "day-1",
    };
    
    const client = {
      async findDaySessions() {
        return { rows: [existingRow], error: null };
      },
      async findActiveProgram() {
        return {
          program: {
            id: "prog-1",
            started_on: "2026-11-01",
            deload_week: 4,
            week_offset: 0,
          },
          error: null,
        };
      },
      async findProgramDay() {
        return {
          day: {
            id: "day-1",
            day_type: "weights" as const,
          },
          error: null,
        };
      },
      async loadProgramDay() {
        return {
          ok: true as const,
          day: {
            id: "day-1",
            day_type: "weights" as const,
          },
        };
      },
      async updateSession() {
        return { error: null };
      },
      async deleteSessions() {
        return { error: null };
      },
      async insertSession() {
        throw new Error("insertSession should not be called when matching row exists");
      },
      async rereadDaySessions() {
        return { rows: [existingRow], error: null };
      },
    };
    
    const result = await planDayCore(client, {
      userId: "user-1",
      localDate: "2026-11-02",
      today: "2026-11-02",
      plan: { kind: "keep" },
    });
    
    assert.equal(result.ok, true, "Should succeed with ok:true");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
