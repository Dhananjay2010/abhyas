/**
 * Test: nextDayPlanCore with collision resolution (mutant vii)
 * 
 * Tests nextDayPlanCore with function fakes.
 * Scenario: today is scheduled Rest, user did Lower (swap), tomorrow is scheduled Lower.
 * Expected: returns Upper's programDayId, plannedLabel "Upper", collisionResolved true.
 * 
 * Mutant: returns scheduled programDayId instead of collision-resolved → test fails.
 * 
 * Run: npx tsx scripts/test-next-day-plan-core.ts
 */

import { strict as assert } from "node:assert";
import { nextDayPlanCore } from "../src/lib/program/day-plan";
import type { NextDayPlanCoreDeps } from "../src/lib/program/day-plan";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

async function main() {
  console.log("Test: nextDayPlanCore collision resolution (mutant vii)\n");

  console.log("1. Rest-day swap collision: returns Upper with programDayId and collisionResolved true");
  {
    const programDays = [
      { id: "lower-id", day_index: 2, day_type: "weights" as DayType, label: "Lower" },
      { id: "upper-id", day_index: 4, day_type: "weights" as DayType, label: "Upper" },
    ];

    const plannableDays = [
      { programDayId: "lower-id", dayType: "weights" as DayType, label: "Lower" },
      { programDayId: "upper-id", dayType: "weights" as DayType, label: "Upper" },
    ];

    const deps: NextDayPlanCoreDeps = {
      async getTodayCompletedSession() {
        return {
          programDayId: "lower-id",
          actualType: "weights",
        };
      },

      async getAllProgramDays() {
        return programDays;
      },

      async getResolvedTomorrow() {
        return {
          localDate: "2024-03-04",
          dayType: "weights",
          label: "Lower",
          programDayId: "lower-id",
          isOverride: false,
        };
      },

      async getPlannableDays() {
        return plannableDays;
      },

      getTodayDayIndex: () => 0,
      getToday: () => "2024-03-03",
      getTomorrow: () => "2024-03-04",
    };

    const result = await nextDayPlanCore(deps);

    assert.ok(result, "Should return a result");
    assert.equal(result.programDayId, "upper-id", "Should return Upper's programDayId (collision resolved)");
    assert.equal(result.plannedLabel, "Upper", "Should return Upper label");
    assert.equal(result.collisionResolved, true, "Should mark collision as resolved");

    console.log("  ✓ nextDayPlanCore returned Upper's programDayId with collisionResolved true");
  }

  console.log("\n2. No swap: returns scheduled day with collisionResolved false");
  {
    const programDays = [
      { id: "rest-id", day_index: 0, day_type: "rest" as DayType, label: null },
      { id: "lower-id", day_index: 2, day_type: "weights" as DayType, label: "Lower" },
    ];

    const plannableDays = [
      { programDayId: "lower-id", dayType: "weights" as DayType, label: "Lower" },
    ];

    const deps: NextDayPlanCoreDeps = {
      async getTodayCompletedSession() {
        return null;
      },

      async getAllProgramDays() {
        return programDays;
      },

      async getResolvedTomorrow() {
        return {
          localDate: "2024-03-05",
          dayType: "weights",
          label: "Lower",
          programDayId: "lower-id",
          isOverride: false,
        };
      },

      async getPlannableDays() {
        return plannableDays;
      },

      getTodayDayIndex: () => 1,
      getToday: () => "2024-03-04",
      getTomorrow: () => "2024-03-05",
    };

    const result = await nextDayPlanCore(deps);

    assert.ok(result, "Should return a result");
    assert.equal(result.programDayId, "lower-id", "Should return scheduled programDayId");
    assert.equal(result.collisionResolved, false, "Should not mark collision as resolved");

    console.log("  ✓ nextDayPlanCore returned scheduled day with collisionResolved false");
  }

  console.log("\n✅ All nextDayPlanCore collision tests passed");
  console.log("  ✓ nextDayPlanCore returned Upper's programDayId with collisionResolved true");
  console.log("  ✓ nextDayPlanCore returned scheduled day with collisionResolved false");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
