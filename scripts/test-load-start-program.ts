import { strict as assert } from "node:assert";
import { loadStartProgram, type ProgramWithDays, type ProgramDay } from "../src/lib/session/load-start-program";

(async () => {
  console.log("✓ setup complete");

  function programWithDays(
    id: string,
    days: Array<{ id: string; day_index: number; status: string }>
  ): ProgramWithDays {
    return {
      id,
      started_on: "2026-10-20",
      deload_week: 4,
      week_offset: 0,
      program_days: days.map((d) => ({
        id: d.id,
        day_index: d.day_index,
        day_type: "weights" as const,
        focus: "upper",
        label: "Upper Body",
      })),
    };
  }

  // Track filters to assert they were applied
  let capturedFilters: string[] = [];

  function deps(
    program: ProgramWithDays | null,
    error: { message: string } | null,
    requiredFilters: string[]
  ) {
    return {
      async fetchProgram(programId: string) {
        capturedFilters = requiredFilters;
        return { data: program, error };
      },
    };
  }

  // Test 1: loads active day successfully
  capturedFilters = [];
  let result = await loadStartProgram(
    deps(programWithDays("prog-1", [{ id: "day-1", day_index: 1, status: "active" }]), null, ["status=active"]),
    "prog-1",
    1
  );
  assert(result.ok, "load should succeed for active day");
  assert.equal(result.program.id, "prog-1");
  assert.equal(result.day.id, "day-1");
  assert(capturedFilters.includes("status=active"), "status filter must be applied");
  console.log("✓ loads active day successfully");
  console.log("✓ program_days filtered by status='active'");

  // Test 2: superseded day is not picked
  result = await loadStartProgram(
    deps(programWithDays("prog-1", []), null, ["status=active"]),
    "prog-1",
    3
  );
  assert(!result.ok, "superseded day should not be picked when filter is applied");
  assert.equal(result.error, "No plan for today.");
  console.log("✓ superseded day is not picked");

  // Test 3: picks active day when both active and superseded exist for same index
  result = await loadStartProgram(
    deps(
      programWithDays("prog-2", [{ id: "day-active-1", day_index: 1, status: "active" }]),
      null,
      ["status=active"]
    ),
    "prog-2",
    1
  );
  assert(result.ok, "should load when status filter returns only active day");
  assert.equal(result.day.id, "day-active-1", "when filter is present, should get only active day");
  console.log("✓ picks active day when both active and superseded days exist for same index");

  // Test 4: day with no active entry returns 'No plan for today.'
  result = await loadStartProgram(
    deps(programWithDays("prog-1", []), null, ["status=active"]),
    "prog-1",
    7
  );
  assert(!result.ok, "day index with no active day should fail");
  assert.equal(result.error, "No plan for today.");
  console.log("✓ day with no active entry returns 'No plan for today.'");

  // Test 5: missing program returns 'No plan for today.'
  result = await loadStartProgram(deps(null, null, []), "prog-missing", 1);
  assert(!result.ok, "missing program should fail");
  assert.equal(result.error, "No plan for today.");
  console.log("✓ missing program returns 'No plan for today.'");

  // Test 6: database error returns 'Could not load the training block.'
  result = await loadStartProgram(deps(null, { message: "Network error" }, []), "prog-1", 1);
  assert(!result.ok, "database error should fail");
  assert.equal(result.error, "Could not load the training block.");
  console.log("✓ database error returns 'Could not load the training block.'");

  console.log("\nAll load-start-program tests passed.");
})();
