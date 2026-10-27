/**
 * Test: start-session resolveTodayDay collision resolution (mutant viii)
 * 
 * Tests that resolveTodayProgramDayCore resolves collisions correctly.
 * Scenario: yesterday was Rest (scheduled), user did Lower (swap), today is scheduled Lower.
 * Expected: resolves to Upper's programDayId (collision resolved).
 * 
 * Mutant: resolveTodayProgramDayCore skips collision → test fails
 * 
 * Run: npx tsx scripts/test-start-session-today-resolve.ts
 */

import { strict as assert } from "node:assert";
import { resolveTodayProgramDayCore } from "../src/lib/program/day-plan";
import type { ResolveTodayCoreDeps } from "../src/lib/program/day-plan";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

const WEIGHTS: DayType = "weights";
const REST: DayType = "rest";

async function main() {
  console.log("Test: start-session resolveTodayDay collision resolution (mutant viii)\n");

  console.log("1. Rest-day swap collision: resolveTodayDay returns Upper's programDayId");
  {
    const programDays = [
      { id: "rest-id", day_index: 0, day_type: REST, label: null },
      { id: "lower-id", day_index: 2, day_type: WEIGHTS, label: "Lower" },
      { id: "upper-id", day_index: 4, day_type: WEIGHTS, label: "Upper" },
    ];

    const deps: ResolveTodayCoreDeps = {
      async getAllProgramDays() {
        return programDays;
      },

      async getYesterdaySession() {
        return {
          programDayId: "lower-id",
          actualType: "weights",
        };
      },

      getTodayIndex: () => 2,
      getYesterdayIndex: () => 0,
    };

    const result = await resolveTodayProgramDayCore(deps);

    assert.ok(result, "Should return a result");
    assert.equal(result.programDayId, "upper-id", "Should return Upper's programDayId (collision resolved)");

    console.log("  ✓ Returned Upper's programDayId after collision resolution");
  }

  console.log("\n2. No collision: resolveTodayDay returns scheduled day");
  {
    const programDays = [
      { id: "lower-id", day_index: 2, day_type: WEIGHTS, label: "Lower" },
      { id: "upper-id", day_index: 4, day_type: WEIGHTS, label: "Upper" },
    ];

    const deps: ResolveTodayCoreDeps = {
      async getAllProgramDays() {
        return programDays;
      },

      async getYesterdaySession() {
        return null;
      },

      getTodayIndex: () => 2,
      getYesterdayIndex: () => 1,
    };

    const result = await resolveTodayProgramDayCore(deps);

    assert.ok(result, "Should return a result");
    assert.equal(result.programDayId, "lower-id", "Should return Lower's programDayId (no collision)");

    console.log("  ✓ Returned scheduled day when no collision");
  }

  console.log("\n✅ All start-session resolveTodayDay tests passed");
  console.log("  ✓ Returned Upper's programDayId after collision resolution");
  console.log("  ✓ Returned scheduled day when no collision");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
