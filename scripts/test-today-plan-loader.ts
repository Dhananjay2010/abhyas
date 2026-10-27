/**
 * Test: Today page plan loader with collision resolution (mutant vi)
 * 
 * Tests loadTodayPlan with function fakes.
 * Scenario: yesterday was Rest (scheduled), user did Lower (swap), today is scheduled Lower.
 * Expected: returns Upper's programDayId.
 * 
 * Mutant: loadTodayPlan skips resolveTodayDay and returns scheduled → test fails.
 * 
 * Run: npx tsx scripts/test-today-plan-loader.ts
 */

import { strict as assert } from "node:assert";
import { loadTodayPlan } from "../src/lib/today/load-today-plan";
import type { LoadTodayPlanDeps } from "../src/lib/today/load-today-plan";
import type { Database } from "../src/lib/database.types";

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  focus: string | null;
  label: string | null;
  program_day_exercises: Array<{
    order_index: number;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
    rest_seconds: number | null;
    exercises: {
      name: string;
      cue: string | null;
      movement_pattern: string | null;
      metric: string | null;
    } | null;
  }>;
};

async function main() {
  console.log("Test: Today plan loader with post-swap collision resolution\n");

  console.log("1. Rest-day swap collision: loader returns Upper's programDayId");
  {
    const programDays: ProgramDay[] = [
      { id: "lower-id", day_index: 2, day_type: "weights", label: "Lower", focus: "lower", program_day_exercises: [] },
      { id: "upper-id", day_index: 4, day_type: "weights", label: "Upper", focus: "upper", program_day_exercises: [] },
    ];

    const deps: LoadTodayPlanDeps = {
      async getProgramDays() {
        return programDays;
      },

      async resolveTodayDay() {
        return {
          programDayId: "upper-id",
          dayType: "weights",
          label: "Upper",
        };
      },
    };

    const result = await loadTodayPlan(deps, "prog-id", "2024-03-05", 2);

    assert.ok(result.resolved, "Should return resolved day");
    assert.equal(result.resolved.id, "upper-id", "Should return Upper's programDayId");

    console.log("  ✓ Loader returned Upper's programDayId after collision resolution");
  }

  console.log("\n2. No collision: loader returns scheduled day");
  {
    const programDays: ProgramDay[] = [
      { id: "lower-id", day_index: 2, day_type: "weights", label: "Lower", focus: "lower", program_day_exercises: [] },
      { id: "upper-id", day_index: 4, day_type: "weights", label: "Upper", focus: "upper", program_day_exercises: [] },
    ];

    const deps: LoadTodayPlanDeps = {
      async getProgramDays() {
        return programDays;
      },

      async resolveTodayDay() {
        return {
          programDayId: "lower-id",
          dayType: "weights",
          label: "Lower",
        };
      },
    };

    const result = await loadTodayPlan(deps, "prog-id", "2024-03-05", 2);

    assert.ok(result.resolved, "Should return resolved day");
    assert.equal(result.resolved.id, "lower-id", "Should return Lower's programDayId");

    console.log("  ✓ Loader returned scheduled day when no collision");
  }

  console.log("\n✅ All today plan loader tests passed");
  console.log("  ✓ Loader returned Upper's programDayId after collision resolution");
  console.log("  ✓ Loader returned scheduled day when no collision");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
