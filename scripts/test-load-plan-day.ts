import { strict as assert } from "node:assert";
import { createFakeDb } from "./helpers/fake-postgrest";
import { loadPlanDay } from "../src/lib/session/load-plan-day";

const db = createFakeDb({
  tables: {
    program_days: [
      {
        id: "day-active",
        program_id: "prog-1",
        day_index: 1,
        day_type: "strength",
        status: "active",
      },
      {
        id: "day-superseded",
        program_id: "prog-1",
        day_index: 2,
        day_type: "strength",
        status: "superseded",
      },
      {
        id: "day-inactive",
        program_id: "prog-1",
        day_index: 3,
        day_type: "rest",
        status: "inactive",
      },
    ],
  },
});

console.log("✓ setup complete");

const result1 = await loadPlanDay(db.client, "day-active");
assert(result1.ok, "load should succeed for active day");
assert.equal(result1.day.id, "day-active");
assert.equal(result1.day.day_type, "strength");
console.log("✓ loads active day successfully");

const lastRequest = db.requests[db.requests.length - 1];
assert(lastRequest.filters["status"] === "eq.active", "status filter must be applied");
console.log("✓ day filtered by status='active'");

const result2 = await loadPlanDay(db.client, "day-superseded");
assert(!result2.ok, "superseded day should not be loaded");
assert.equal(result2.error, "That day is not in your block.");
console.log("✓ superseded day returns 'That day is not in your block.'");

const result3 = await loadPlanDay(db.client, "day-inactive");
assert(!result3.ok, "inactive day should not be loaded");
assert.equal(result3.error, "That day is not in your block.");
console.log("✓ inactive day returns 'That day is not in your block.'");

const result4 = await loadPlanDay(db.client, "day-missing");
assert(!result4.ok, "missing day should fail");
assert.equal(result4.error, "That day is not in your block.");
console.log("✓ missing day returns 'That day is not in your block.'");

console.log("\nAll load-plan-day tests passed.");
