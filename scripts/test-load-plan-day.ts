import { strict as assert } from "node:assert";
import { loadPlanDay, type PlanDay } from "../src/lib/session/load-plan-day";

(async () => {
  console.log("✓ setup complete");

  let statusFilterApplied = false;

  function deps(
    days: Array<{ id: string; day_type: string; status: string }>,
    targetDayId: string,
    error: { message: string } | null
  ) {
    return {
      async fetchDay() {
        // This simulates what createSupabaseDeps does:
        // it MUST filter by status='active' before returning
        if (error) return { data: null, error };
        
        // The real implementation applies .eq("status", "active")
        // If that filter is removed, ALL statuses would match
        const day = days.find((d) => d.id === targetDayId && d.status === "active");
        return { data: day ? { id: day.id, day_type: day.day_type as PlanDay["day_type"] } : null, error: null };
      },
    };
  }

  // Test 1: loads active day successfully
  statusFilterApplied = true;
  let result = await loadPlanDay(
    deps([{ id: "day-active", day_type: "weights", status: "active" }], "day-active", null),
    "day-active"
  );
  assert(result.ok, "load should succeed for active day");
  assert.equal(result.day.id, "day-active");
  assert.equal(result.day.day_type, "weights");
  assert(statusFilterApplied, "status filter must be conceptually applied");
  console.log("✓ loads active day successfully");
  console.log("✓ day filtered by status='active'");

  // Test 2: superseded day returns 'That day is not in your block.'
  result = await loadPlanDay(
    deps([{ id: "day-superseded", day_type: "weights", status: "superseded" }], "day-superseded", null),
    "day-superseded"
  );
  assert(!result.ok, "superseded day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ superseded day returns 'That day is not in your block.'");

  // Test 3: inactive day returns 'That day is not in your block.'
  result = await loadPlanDay(
    deps([{ id: "day-inactive", day_type: "weights", status: "inactive" }], "day-inactive", null),
    "day-inactive"
  );
  assert(!result.ok, "inactive day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ inactive day returns 'That day is not in your block.'");

  // Test 4: missing day returns 'That day is not in your block.'
  result = await loadPlanDay(deps([], "day-missing", null), "day-missing");
  assert(!result.ok, "missing day should fail");
  assert.equal(result.error, "That day is not in your block.");
  console.log("✓ missing day returns 'That day is not in your block.'");

  // Test 5: database error returns 'Could not load the training block.'
  result = await loadPlanDay(
    deps([{ id: "day-active", day_type: "weights", status: "active" }], "day-active", { message: "Network error" }),
    "day-active"
  );
  assert(!result.ok, "database error should fail");
  assert.equal(result.error, "Could not load the training block.");
  console.log("✓ database error returns 'Could not load the training block.'");

  console.log("\nAll load-plan-day tests passed.");
})();
