import { strict as assert } from "node:assert";
import { loadPlanDay, createSupabaseDeps } from "../src/lib/session/load-plan-day";
import { createFakeDb, json, type Row } from "./helpers/fake-postgrest";

(async () => {
  console.log("✓ setup complete");

  function dayRow(id: string, status: string): Row {
    return {
      id,
      day_type: "weights",
      status,
    };
  }

  function assertFilter(fake: ReturnType<typeof createFakeDb>, column: string, value: string) {
    const query = fake.requests.find((r) => r.table === "program_days" && r.method === "GET");
    assert(query, "No GET request found for program_days");
    const filter = query.filters[column];
    if (!filter) {
      throw new Error(`Missing required filter: ${column}. All filters: ${JSON.stringify(query.filters)}`);
    }
    assert.equal(filter, value, `Expected filter ${column}=${value}, got ${column}=${filter}`);
  }

  // Test 1: loads active day successfully and verifies filter
  let fake = createFakeDb({ tables: { program_days: [dayRow("day-active", "active")] } });
  let result = await loadPlanDay(createSupabaseDeps(fake.client), "day-active");
  assert(result.ok, "load should succeed for active day");
  assert.equal(result.day.id, "day-active");
  assert.equal(result.day.day_type, "weights");
  assertFilter(fake, "status", "eq.active");
  console.log("✓ loads active day successfully");
  console.log("✓ day filtered by status='active'");

  // Test 2: superseded day returns error (filtered out)
  fake = createFakeDb({ tables: { program_days: [dayRow("day-superseded", "superseded")] } });
  result = await loadPlanDay(createSupabaseDeps(fake.client), "day-superseded");
  assert(!result.ok, "superseded day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  assertFilter(fake, "status", "eq.active");
  console.log("✓ superseded day returns 'That day is not in your block.'");

  // Test 3: inactive day returns error (filtered out)
  fake = createFakeDb({ tables: { program_days: [dayRow("day-inactive", "inactive")] } });
  result = await loadPlanDay(createSupabaseDeps(fake.client), "day-inactive");
  assert(!result.ok, "inactive day should not be loaded");
  assert.equal(result.error, "That day is not in your block.");
  assertFilter(fake, "status", "eq.active");
  console.log("✓ inactive day returns 'That day is not in your block.'");

  // Test 4: missing day returns error
  fake = createFakeDb({ tables: { program_days: [] } });
  result = await loadPlanDay(createSupabaseDeps(fake.client), "day-missing");
  assert(!result.ok, "missing day should fail");
  assert.equal(result.error, "That day is not in your block.");
  assertFilter(fake, "status", "eq.active");
  console.log("✓ missing day returns 'That day is not in your block.'");

  // Test 5: database error returns 'Could not load the training block.'
  fake = createFakeDb({ tables: { program_days: [] } });
  fake.beforeRequest = () => json(500, { code: "XX000", message: "Network error", details: null, hint: null });
  result = await loadPlanDay(createSupabaseDeps(fake.client), "day-error");
  assert(!result.ok, "database error should fail");
  assert.equal(result.error, "Could not load the training block.");
  console.log("✓ database error returns 'Could not load the training block.'");

  console.log("\nAll load-plan-day tests passed.");
})();
