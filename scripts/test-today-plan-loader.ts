/**
 * Test: Today plan loader with post-swap collision resolution
 * 
 * Tests loadTodayPlan with structural fake client.
 * Scenario: yesterday was scheduled Rest, user did Lower (swap), today is scheduled Lower.
 * Expected: loader returns Upper's programDayId after collision resolution.
 * 
 * Run: npx tsx scripts/test-today-plan-loader.ts
 */

import { strict as assert } from "node:assert";
import { loadTodayPlan } from "../src/lib/today/load-today-plan";

console.log("Test: Today plan loader with post-swap collision resolution\n");

console.log("1. Rest-day swap collision: loader returns Upper's programDayId");
(async () => {
  const programDays = [
    { 
      id: "lower-id", 
      day_index: 2, 
      day_type: "weights" as const, 
      focus: null,
      label: "Lower",
      program_day_exercises: [],
    },
    { 
      id: "upper-id", 
      day_index: 4, 
      day_type: "weights" as const, 
      focus: null,
      label: "Upper",
      program_day_exercises: [],
    },
  ];
  
  const deps = {
    async getProgramDays() {
      return programDays;
    },
    async resolveTodayDay() {
      // Collision resolution returns Upper
      return {
        programDayId: "upper-id",
        dayType: "weights",
        label: "Upper",
      };
    },
  };
  
  // Today is Tuesday (day_index 2), scheduled Lower
  const result = await loadTodayPlan(deps, "prog-1", "2026-10-28", 2);
  
  assert.ok(result.scheduled, "Should have scheduled day");
  assert.equal(result.scheduled.id, "lower-id", "Scheduled should be Lower");
  assert.ok(result.resolved, "Should have resolved day");
  assert.equal(result.resolved.id, "upper-id", "Resolved should be Upper (collision resolved)");
  assert.equal(result.resolved.label, "Upper", "Resolved label should be Upper");
  
  console.log("  ✓ Loader returned Upper's programDayId after collision resolution");
})();

console.log("\n2. No collision: loader returns scheduled day");
(async () => {
  const programDays = [
    { 
      id: "lower-id", 
      day_index: 2, 
      day_type: "weights" as const, 
      focus: null,
      label: "Lower",
      program_day_exercises: [],
    },
    { 
      id: "upper-id", 
      day_index: 4, 
      day_type: "weights" as const, 
      focus: null,
      label: "Upper",
      program_day_exercises: [],
    },
  ];
  
  const deps = {
    async getProgramDays() {
      return programDays;
    },
    async resolveTodayDay() {
      // No collision: returns scheduled day
      return {
        programDayId: "lower-id",
        dayType: "weights",
        label: "Lower",
      };
    },
  };
  
  const result = await loadTodayPlan(deps, "prog-1", "2026-10-28", 2);
  
  assert.ok(result.scheduled, "Should have scheduled day");
  assert.equal(result.scheduled.id, "lower-id", "Scheduled should be Lower");
  assert.ok(result.resolved, "Should have resolved day");
  assert.equal(result.resolved.id, "lower-id", "Resolved should be Lower (no collision)");
  
  console.log("  ✓ Loader returned scheduled day when no collision");
})();

console.log("\n✅ All today plan loader tests passed");
