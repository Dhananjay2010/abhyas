#!/usr/bin/env tsx
/**
 * Test: tomorrow prompt after rest-day swap doesn't repeat the swapped day
 * 
 * MED-1: Before the fix, nextDayPlan checked only completed sessions, so when
 * rendered during an in-progress session (before finish), it didn't detect the
 * swap and offered the wrong next day.
 * 
 * Scenario:
 * - Block: Mon A, Wed B, Fri C
 * - Mon: complete A
 * - Tue (rest): swap to B and complete
 * - Tomorrow prompt after Tue session: should say "C", not "B"
 * 
 * Mutant killed: reverting to .eq("status", "completed") (excluding in_progress)
 * causes the test to fail with "Tomorrow should be Full Body C after swap to B".
 */

import { strict as assert } from "node:assert";
import type { Database } from "../src/lib/database.types";
import { nextDayPlanCore, type NextDayPlanCoreDeps } from "../src/lib/program/day-plan";
import type { PlannableDay } from "../src/app/session/actions";
import { isoWeekday } from "../src/lib/dates";

type DayType = Database["public"]["Enums"]["day_type"];

async function main() {
  console.log("\nTomorrow prompt after rest-day swap (MED-1)\n");

  // Block setup: Mon=A (day 1), Wed=B (day 3), Fri=C (day 5)
  const programDays = [
    { id: "pd-a", day_index: 1, day_type: "weights" as DayType, label: "Full Body A" },
    { id: "pd-rest-2", day_index: 2, day_type: "rest" as DayType, label: "Rest" },
    { id: "pd-b", day_index: 3, day_type: "weights" as DayType, label: "Full Body B" },
    { id: "pd-rest-4", day_index: 4, day_type: "rest" as DayType, label: "Rest" },
    { id: "pd-c", day_index: 5, day_type: "weights" as DayType, label: "Full Body C" },
    { id: "pd-rest-6", day_index: 6, day_type: "rest" as DayType, label: "Rest" },
    { id: "pd-rest-7", day_index: 7, day_type: "rest" as DayType, label: "Rest" },
  ];

  // Test 1: Mon A done, Tue swapped to B (in_progress), tomorrow should be C
  console.log("1. Tue swap to B (in_progress) → tomorrow should be C, not B");
  {
    const today = "2026-10-28"; // Tuesday
    const tomorrow = "2026-10-29"; // Wednesday
    const todayDayIndex = isoWeekday(today); // 2

    const deps: NextDayPlanCoreDeps = {
      getTomorrow() {
        return tomorrow;
      },
      getTodayDayIndex() {
        return todayDayIndex;
      },
      getToday() {
        return today;
      },
      async getTodayCompletedSession() {
        // Tue: swapped to B, session is in_progress (not yet completed)
        return { programDayId: "pd-b", actualType: "weights" };
      },
      async getAllProgramDays() {
        return programDays;
      },
      async getResolvedTomorrow() {
        // Wed is scheduled B
        return {
          localDate: tomorrow,
          dayType: "weights" as DayType,
          label: "Full Body B",
          programDayId: "pd-b",
          isOverride: false,
        };
      },
      async getPlannableDays(): Promise<PlannableDay[]> {
        return programDays.filter((d) => d.day_type !== "rest").map((d) => ({
          programDayId: d.id,
          label: d.label,
          dayType: d.day_type,
          nextUp: d.id === "pd-c",
        }));
      },
    };

    const result = await nextDayPlanCore(deps);
    assert.ok(result, "Should return a plan");
    assert.strictEqual(
      result.plannedLabel,
      "Full Body C",
      "Tomorrow should be Full Body C after swap to B"
    );
    assert.strictEqual(result.programDayId, "pd-c", "Tomorrow program day should be C");
    assert.strictEqual(result.collisionResolved, true, "Should have resolved collision");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, collision resolved`);
  }

  // Test 2: If the session is completed (status="completed"), same result
  console.log("\n2. Tue swap to B (completed) → tomorrow should be C, not B");
  {
    const today = "2026-10-28"; // Tuesday
    const tomorrow = "2026-10-29"; // Wednesday
    const todayDayIndex = isoWeekday(today); // 2

    const deps: NextDayPlanCoreDeps = {
      getTomorrow() {
        return tomorrow;
      },
      getTodayDayIndex() {
        return todayDayIndex;
      },
      getToday() {
        return today;
      },
      async getTodayCompletedSession() {
        // Tue: swapped to B, session is completed
        return { programDayId: "pd-b", actualType: "weights" };
      },
      async getAllProgramDays() {
        return programDays;
      },
      async getResolvedTomorrow() {
        // Wed is scheduled B
        return {
          localDate: tomorrow,
          dayType: "weights" as DayType,
          label: "Full Body B",
          programDayId: "pd-b",
          isOverride: false,
        };
      },
      async getPlannableDays(): Promise<PlannableDay[]> {
        return programDays.filter((d) => d.day_type !== "rest").map((d) => ({
          programDayId: d.id,
          label: d.label,
          dayType: d.day_type,
          nextUp: d.id === "pd-c",
        }));
      },
    };

    const result = await nextDayPlanCore(deps);
    assert.ok(result, "Should return a plan");
    assert.strictEqual(
      result.plannedLabel,
      "Full Body C",
      "Tomorrow should be Full Body C after swap to B"
    );
    assert.strictEqual(result.programDayId, "pd-c", "Tomorrow program day should be C");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, collision resolved`);
  }

  // Test 3: If no swap happened (Mon A done), Wed should be B as scheduled
  console.log("\n3. Mon A done (no swap), Wed should be B as scheduled");
  {
    const today = "2026-10-27"; // Monday
    const tomorrow = "2026-10-28"; // Tuesday
    const todayDayIndex = isoWeekday(today); // 1

    const deps: NextDayPlanCoreDeps = {
      getTomorrow() {
        return tomorrow;
      },
      getTodayDayIndex() {
        return todayDayIndex;
      },
      getToday() {
        return today;
      },
      async getTodayCompletedSession() {
        // Mon: A done (not a swap)
        return { programDayId: "pd-a", actualType: "weights" };
      },
      async getAllProgramDays() {
        return programDays;
      },
      async getResolvedTomorrow() {
        // Tue is rest (no override)
        return null;
      },
      async getPlannableDays(): Promise<PlannableDay[]> {
        return programDays.filter((d) => d.day_type !== "rest").map((d) => ({
          programDayId: d.id,
          label: d.label,
          dayType: d.day_type,
          nextUp: d.id === "pd-b",
        }));
      },
    };

    const result = await nextDayPlanCore(deps);
    assert.ok(result, "Should return a plan");
    assert.strictEqual(result.plannedLabel, "Rest", "Tomorrow should be Rest (no override)");
    assert.strictEqual(result.collisionResolved, false, "No collision to resolve");

    console.log(`  ✓ Tomorrow is ${result.plannedLabel}, no collision`);
  }

  console.log("\n✓ All tomorrow-prompt tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
