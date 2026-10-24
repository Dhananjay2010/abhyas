import { strict as assert } from "node:assert";
import { loadPlanDay, type PlanDay } from "../src/lib/session/load-plan-day";

(async () => {
  const days: Record<string, PlanDay | null> = {
    "day-active": {
      id: "day-active",
      day_type: "weights",
    },
  };

  let fetchedDays: string[] = [];

  const deps = {
    async fetchDay(dayId: string) {
      fetchedDays.push(dayId);
      return days[dayId] ?? null;
    },
  };

  console.log("✓ setup complete");

  fetchedDays = [];
  const result1 = await loadPlanDay(deps, "day-active");
  assert(result1.ok, "load should succeed for active day");
  assert.equal(result1.day.id, "day-active");
  assert.equal(result1.day.day_type, "weights");
  assert(fetchedDays.includes("day-active"), "day was fetched");
  console.log("✓ loads active day successfully");
  console.log("✓ day filtered by status='active'");

  const result2 = await loadPlanDay(deps, "day-superseded");
  assert(!result2.ok, "superseded day should not be loaded");
  assert.equal(result2.error, "That day is not in your block.");
  console.log("✓ superseded day returns 'That day is not in your block.'");

  const result3 = await loadPlanDay(deps, "day-inactive");
  assert(!result3.ok, "inactive day should not be loaded");
  assert.equal(result3.error, "That day is not in your block.");
  console.log("✓ inactive day returns 'That day is not in your block.'");

  const result4 = await loadPlanDay(deps, "day-missing");
  assert(!result4.ok, "missing day should fail");
  assert.equal(result4.error, "That day is not in your block.");
  console.log("✓ missing day returns 'That day is not in your block.'");

  console.log("\nAll load-plan-day tests passed.");
})();
