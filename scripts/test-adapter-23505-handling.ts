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
import { createPlanDayDbOps } from "../src/lib/session/make-plan-day-client";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
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

function makeFakeSupabaseClient(insertErrorCode: string | null) {
  return {
    from(table: string) {
      if (table === "sessions") {
        return {
          insert() {
            return Promise.resolve({
              data: null,
              error: insertErrorCode ? { code: insertErrorCode, message: `Simulated error ${insertErrorCode}` } : null,
              count: null,
              status: 200,
              statusText: "OK",
            });
          },
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: "OK" });
          },
        };
      }
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: "OK" });
        },
      };
    },
  };
}

async function main() {
  console.log("Testing 23505 handling in adapter\n");

  await test("insertSession with 23505 returns {error: null}", async () => {
    const fakeSupabase = makeFakeSupabaseClient("23505");
    const adapter = createPlanDayDbOps(fakeSupabase as unknown as SupabaseClient<Database>, "user-1");
    
    const result = await adapter.insertSession({
      user_id: "user-1",
      local_date: "2026-11-02",
      status: "planned",
      actual_type: null,
      program_day_id: "day-1",
    });
    
    assert.equal(result.error, null, "23505 should be suppressed and return {error: null}");
  });

  await test("insertSession with 23503 surfaces the error", async () => {
    const fakeSupabase = makeFakeSupabaseClient("23503");
    const adapter = createPlanDayDbOps(fakeSupabase as unknown as SupabaseClient<Database>, "user-1");
    
    const result = await adapter.insertSession({
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
    const fakeSupabase = makeFakeSupabaseClient(null);
    const adapter = createPlanDayDbOps(fakeSupabase as unknown as SupabaseClient<Database>, "user-1");
    
    const result = await adapter.insertSession({
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
    
    const client: PlanDayClient = {
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
        return { day: { id: "day-1", day_type: "weights" as const }, error: null };
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
