import { strict as assert } from "node:assert";
import { createFakeDb } from "./helpers/fake-postgrest";
import { loadStartProgram } from "../src/lib/session/load-start-program";

const db = createFakeDb({
  tables: {
    programs: [
      {
        id: "prog-1",
        started_on: "2026-10-20",
        deload_week: 4,
        week_offset: 0,
      },
    ],
    program_days: [
      {
        id: "day-1",
        program_id: "prog-1",
        day_index: 1,
        day_type: "strength",
        focus: "upper",
        label: "Upper Body",
        status: "active",
      },
      {
        id: "day-2",
        program_id: "prog-1",
        day_index: 2,
        day_type: "rest",
        focus: null,
        label: null,
        status: "active",
      },
      {
        id: "day-superseded",
        program_id: "prog-1",
        day_index: 3,
        day_type: "strength",
        focus: "lower",
        label: "Lower Body",
        status: "superseded",
      },
    ],
  },
});

console.log("✓ setup complete");

const result1 = await loadStartProgram(db.client, "prog-1", 1);
assert(result1.ok, "load should succeed for active day");
assert.equal(result1.program.id, "prog-1");
assert.equal(result1.dayId, "day-1");
console.log("✓ loads active day successfully");

const lastRequest = db.requests[db.requests.length - 1];
assert(lastRequest.filters["program_days.status"] === "eq.active", "status filter must be applied");
console.log("✓ program_days filtered by status='active'");

const result2 = await loadStartProgram(db.client, "prog-1", 3);
assert(!result2.ok, "superseded day should not be picked");
assert.equal(result2.error, "No plan for today.");
console.log("✓ superseded day is not picked");

const result3 = await loadStartProgram(db.client, "prog-1", 7);
assert(!result3.ok, "day index with no active day should fail");
assert.equal(result3.error, "No plan for today.");
console.log("✓ day with no active entry returns 'No plan for today.'");

const db2 = createFakeDb({
  tables: {
    programs: [],
    program_days: [],
  },
});

const result4 = await loadStartProgram(db2.client, "prog-missing", 1);
assert(!result4.ok, "missing program should fail");
assert.equal(result4.error, "No plan for today.");
console.log("✓ missing program returns 'No plan for today.'");

console.log("\nAll load-start-program tests passed.");
