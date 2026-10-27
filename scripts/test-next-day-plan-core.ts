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

console.log("Test: nextDayPlanCore collision resolution (mutant vii)\n");

console.log("1. Rest-day swap collision: returns Upper with programDayId and collisionResolved true");
(async () => {
  const programDays = [
    { id: "lower-id", day_index: 2, day_type: "weights" as const, label: "Lower" },
    { id: "upper-id", day_index: 4, day_type: "weights" as const, label: "Upper" },
  ];

  const plannableDays = [
    { programDayId: "lower-id", dayType: "weights" as const, label: "Lower" },
    { programDayId: "upper-id", dayType: "weights" as const, label: "Upper" },
  ];

  const deps: NextDayPlanCoreDeps = {
    async getTodayCompletedSession() {
      // Today (Monday, index 1 = Rest) user completed Lower
      return { programDayId: "lower-id", actualType: "weights" };
    },

    async getAllProgramDays() {
      return programDays;
    },

    async getResolvedTomorrow() {
      // Tomorrow (Tuesday, index 2) is scheduled Lower
      return {
        localDate: "2026-10-28",
        dayType: "weights" as const,
        label: "Lower",
        programDayId: "lower-id",
        isOverride: false,
      };
    },

    async getPlannableDays() {
      return plannableDays;
    },

    getTodayDayIndex: () => 1, // Monday (Rest day)
    getToday: () => "2026-10-27",
    getTomorrow: () => "2026-10-28",
  };

  const result = await nextDayPlanCore(deps);

  assert.ok(result, "Should return a result");
  assert.equal(result.plannedLabel, "Upper", "plannedLabel should be Upper");
  assert.equal(result.programDayId, "upper-id", "programDayId should be upper-id (collision resolved)");
  assert.equal(result.collisionResolved, true, "collisionResolved should be true");

  console.log("  ✓ nextDayPlanCore returned Upper's programDayId with collisionResolved true");
})();

console.log("\n2. No swap: returns scheduled day with collisionResolved false");
(async () => {
  const programDays = [
    { id: "lower-id", day_index: 2, day_type: "weights" as const, label: "Lower" },
    { id: "upper-id", day_index: 4, day_type: "weights" as const, label: "Upper" },
  ];

  const plannableDays = [
    { programDayId: "lower-id", dayType: "weights" as const, label: "Lower" },
    { programDayId: "upper-id", dayType: "weights" as const, label: "Upper" },
  ];

  const deps: NextDayPlanCoreDeps = {
    async getTodayCompletedSession() {
      // Today (Tuesday, index 2) user completed scheduled Lower (no swap)
      return { programDayId: "lower-id", actualType: "weights" };
    },

    async getAllProgramDays() {
      return programDays;
    },

    async getResolvedTomorrow() {
      // Tomorrow (Wednesday, index 3) - no workout scheduled (Rest)
      return null;
    },

    async getPlannableDays() {
      return plannableDays;
    },

    getTodayDayIndex: () => 2, // Tuesday (Lower)
    getToday: () => "2026-10-28",
    getTomorrow: () => "2026-10-29",
  };

  const result = await nextDayPlanCore(deps);

  assert.ok(result, "Should return a result");
  assert.equal(result.collisionResolved, false, "collisionResolved should be false");
  assert.equal(result.plannedLabel, "Rest", "plannedLabel should be Rest");

  console.log("  ✓ nextDayPlanCore returned Rest with collisionResolved false");
})();

console.log("\n✅ All nextDayPlanCore collision tests passed");
