/**
 * Test: buildStartSessionFullDeps.resolveTodayDay passes through resolver result (mutant B)
 * 
 * Tests that the deps adapter correctly passes through the result from resolveTodayProgramDay.
 * 
 * Mutant (B): buildStartSessionFullDeps.resolveTodayDay returns null → test fails
 * 
 * Run: npx tsx scripts/test-start-session-full-deps-resolve.ts
 */

import { strict as assert } from "node:assert";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

const WEIGHTS: DayType = "weights";

async function main() {
  console.log("Test: buildStartSessionFullDeps.resolveTodayDay passes through result (mutant B)\n");

  console.log("1. resolveTodayDay returns collision-resolved result");
  {
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { program_day_id: "upper-id", actual_type: "weights" },
                  }),
                }),
              }),
            }),
          }),
          order: () => ({
            data: [
              { id: "rest-id", day_index: 0, day_type: "rest", label: null },
              { id: "lower-id", day_index: 2, day_type: "weights", label: "Lower" },
              { id: "upper-id", day_index: 4, day_type: "weights", label: "Upper" },
            ],
          }),
        }),
      }),
    } as any;

    const deps = buildStartSessionFullDeps(mockSupabase, "test-user", Date.now());
    
    const result = await deps.resolveTodayDay!("prog-id", "2024-03-05");

    assert.ok(result, "resolveTodayDay must return a result (not null)");
    assert.equal(result.programDayId, "upper-id", "Must return collision-resolved programDayId");
    assert.equal(result.dayType, WEIGHTS, "Must return correct dayType");
    assert.equal(result.label, "Upper", "Must return correct label");

    console.log("  ✓ resolveTodayDay returned collision-resolved result");
    console.log("  ✓ programDayId: upper-id");
    console.log("  ✓ dayType: weights");
    console.log("  ✓ label: Upper");
  }

  console.log("\n✅ buildStartSessionFullDeps.resolveTodayDay passes through correctly");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
