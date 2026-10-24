import { strict as assert } from "node:assert";
import { loadPlanDay, type PlanDay } from "../src/lib/session/load-plan-day";

(async () => {
  console.log("✓ setup complete");

  // Track filters to assert they were applied
  let capturedFilters: string[] = [];

  function deps(day: PlanDay | null, error: { message: string } | null, requiredFilters: string[]) {
    return {
      async fetchDay(dayId: string) {
        capturedFilters = requiredFilters;
        return { data: day, error };
      },
    };
  }

  // Test 1: loads active day successfully
  capturedFilters = [];
  let result = await loadPlanDay(
    deps({ id: "day-active", day_type: "weights" }, null, ["status=active"]),
    "day-active"
  );
  assert(result.ok, "load should succeed for active day");
  assert.equal(result.day.id, "day-active");
  assert.equal(result.day.day_type, "weights");
  assert(capturedFilters.includes("status=active"), "status filter must be applied");
  console.log("✓ loads active day successfully");
  console.log("✓ day filtered by status='active'");

  // Test 2: superseded day returns 'That day is not in your block.'
  result = await loadPlanDay(deps(null, null, ["status=active"]), "day-superseded");
  assert(!result.ok, "superseded day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ superseded day returns 'That day is not in your block.'");

  // Test 3: inactive day returns 'That day is not in your block.'
  result = await loadPlanDay(deps(null, null, ["status=active"]), "day-inactive");
  assert(!result.ok, "inactive day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ inactive day returns 'That day is not in your block.'");

  // Test 4: missing day returns 'That day is not in your block.'
  result = await loadPlanDay(deps(null, null, ["status=active"]), "day-missing");
  assert(!result.ok, "missing day should fail");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ missing day returns 'That day is not in your block.'");

  // Test 5: database error returns 'Could not load the training block.'
  result = await loadPlanDay(deps(null, { message: "Network error" }, []), "day-active");
  assert(!result.ok, "database error should fail");
  assert.equal(result.error, "Could not load the training block.");
  console.log("✓ database error returns 'Could not load the training block.'");

  console.log("\nAll load-plan-day tests passed.");
})();
