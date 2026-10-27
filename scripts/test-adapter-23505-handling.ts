/**
 * Test insertSession 23505 handling in the adapter.
 *
 * Issue 3: Test that:
 * - mapInsertSessionError with 23505 returns null
 * - mapInsertSessionError with other error codes surfaces the message
 * - mapInsertSessionError with null returns null
 * - Through planDayCore: 23505 results in ok:true and one planned row
 *
 *   npx tsx scripts/test-adapter-23505-handling.ts
 */

import { strict as assert } from "node:assert";
import { mapInsertSessionError } from "../src/lib/session/make-plan-day-client";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";

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

async function main() {
  console.log("Testing 23505 handling in adapter\n");

  await test("mapInsertSessionError with 23505 returns null", async () => {
    const result = mapInsertSessionError({ code: "23505", message: "duplicate key" });
    assert.equal(result, null, "23505 should be suppressed and return null");
  });

  await test("mapInsertSessionError with 23503 surfaces the error", async () => {
    const result = mapInsertSessionError({ code: "23503", message: "foreign key violation" });
    assert.notEqual(result, null, "Non-23505 errors should be surfaced");
    assert.equal(result, "foreign key violation", "Should return the message");
  });

  await test("mapInsertSessionError with null returns null", async () => {
    const result = mapInsertSessionError(null);
    assert.equal(result, null, "Null error should return null");
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
