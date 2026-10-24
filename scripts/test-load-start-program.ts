import { strict as assert } from "node:assert";
import { loadStartProgram, createSupabaseDeps, type ProgramDay } from "../src/lib/session/load-start-program";
import { createFakeDb, json, type Row } from "./helpers/fake-postgrest";

(async () => {
  console.log("✓ setup complete");

  function programRow(id: string): Row {
    return {
      id,
      started_on: "2026-10-20",
      deload_week: 4,
      week_offset: 0,
    };
  }

  function dayRow(id: string, programId: string, dayIndex: number, status: string): Row {
    return {
      id,
      program_id: programId,
      day_index: dayIndex,
      day_type: "weights",
      focus: "upper",
      label: "Upper Body",
      status,
    };
  }

  function assertFilter(fake: ReturnType<typeof createFakeDb>, table: string, column: string, value: string) {
    const query = fake.requests.find((r) => r.table === table && r.method === "GET");
    assert.ok(query, `No GET request found for table ${table}`);
    const filter = query.filters[column];
    assert.ok(filter, `Missing required filter: ${column}. All filters: ${JSON.stringify(query.filters)}`);
    assert.equal(filter, value, `Expected filter ${column}=${value}, got ${column}=${filter}`);
  }

  // Test 1: loads active day successfully and verifies filters
  let fake = createFakeDb({
    tables: { programs: [programRow("prog-1")], program_days: [dayRow("day-1", "prog-1", 1, "active")] },
  });
  fake.beforeRequest = (req) => {
    if (req.table === "programs" && req.method === "GET") {
      const statusFilter = req.filters["program_days.status"];
      const idFilter = req.filters["id"];
      if (!statusFilter || !idFilter) return undefined;
      
      // Extract program id
      const programId = idFilter.replace(/^eq\./, "");
      const program = fake.tables.programs.find((p: Row) => p.id === programId);
      if (!program) return json(200, []);
      
      // Filter program_days by status
      const statusValue = statusFilter.replace(/^eq\./, "");
      const days = (fake.tables.program_days as Row[])
        .filter((d: Row) => d.program_id === programId && d.status === statusValue)
        .map((d: Row) => ({
          id: d.id,
          day_index: d.day_index,
          day_type: d.day_type,
          focus: d.focus,
          label: d.label,
        }));
      
      return json(200, {
        ...program,
        program_days: days,
      });
    }
    return undefined;
  };
  
  let result = await loadStartProgram(createSupabaseDeps(fake.client), "prog-1", 1);
  assert(result.ok, "load should succeed for active day");
  assert.equal(result.program.id, "prog-1");
  assert.equal(result.day.id, "day-1");
  assertFilter(fake, "programs", "program_days.status", "eq.active");
  assertFilter(fake, "programs", "id", "eq.prog-1");
  console.log("✓ loads active day successfully");
  console.log("✓ program_days filtered by status='active'");

  // Test 2: superseded day is not picked (filtered out)
  fake = createFakeDb({
    tables: { programs: [programRow("prog-1")], program_days: [dayRow("day-superseded", "prog-1", 3, "superseded")] },
  });
  fake.beforeRequest = (req) => {
    if (req.table === "programs" && req.method === "GET") {
      const statusFilter = req.filters["program_days.status"];
      const idFilter = req.filters["id"];
      if (!statusFilter || !idFilter) return undefined;
      
      const programId = idFilter.replace(/^eq\./, "");
      const program = fake.tables.programs.find((p: Row) => p.id === programId);
      if (!program) return json(200, []);
      
      const statusValue = statusFilter.replace(/^eq\./, "");
      const days = (fake.tables.program_days as Row[])
        .filter((d: Row) => d.program_id === programId && d.status === statusValue)
        .map((d: Row) => ({
          id: d.id,
          day_index: d.day_index,
          day_type: d.day_type,
          focus: d.focus,
          label: d.label,
        }));
      
      return json(200, {
        ...program,
        program_days: days,
      });
    }
    return undefined;
  };
  
  result = await loadStartProgram(createSupabaseDeps(fake.client), "prog-1", 3);
  assert(!result.ok, "superseded day should not be picked when filter is applied");
  assert.equal(result.error, "No plan for today.");
  assertFilter(fake, "programs", "program_days.status", "eq.active");
  console.log("✓ superseded day is not picked");

  // Test 3: picks active day when both active and superseded exist
  fake = createFakeDb({
    tables: {
      programs: [programRow("prog-2")],
      program_days: [
        dayRow("day-superseded-1", "prog-2", 1, "superseded"),
        dayRow("day-active-1", "prog-2", 1, "active"),
      ],
    },
  });
  fake.beforeRequest = (req) => {
    if (req.table === "programs" && req.method === "GET") {
      const statusFilter = req.filters["program_days.status"];
      const idFilter = req.filters["id"];
      if (!statusFilter || !idFilter) return undefined;
      
      const programId = idFilter.replace(/^eq\./, "");
      const program = fake.tables.programs.find((p: Row) => p.id === programId);
      if (!program) return json(200, []);
      
      const statusValue = statusFilter.replace(/^eq\./, "");
      const days = (fake.tables.program_days as Row[])
        .filter((d: Row) => d.program_id === programId && d.status === statusValue)
        .map((d: Row) => ({
          id: d.id,
          day_index: d.day_index,
          day_type: d.day_type,
          focus: d.focus,
          label: d.label,
        }));
      
      return json(200, {
        ...program,
        program_days: days,
      });
    }
    return undefined;
  };
  
  result = await loadStartProgram(createSupabaseDeps(fake.client), "prog-2", 1);
  assert(result.ok, "should load when status filter returns only active day");
  assert.equal(result.day.id, "day-active-1", "active day should be returned, superseded filtered out");
  assertFilter(fake, "programs", "program_days.status", "eq.active");
  console.log("✓ picks active day when both active and superseded days exist for same index");

  // Test 4: database error returns 'Could not load the training block.'
  fake = createFakeDb({ tables: { programs: [], program_days: [] } });
  fake.beforeRequest = () => json(500, { code: "XX000", message: "Network error", details: null, hint: null });
  
  result = await loadStartProgram(createSupabaseDeps(fake.client), "prog-1", 1);
  assert(!result.ok, "database error should fail");
  assert.equal(result.error, "Could not load the training block.");
  console.log("✓ database error returns 'Could not load the training block.'");

  // Test 5: missing program returns 'No plan for today.' (using typed deps fake)
  result = await loadStartProgram(
    {
      async fetchProgram() {
        return { data: null, error: null };
      },
    },
    "prog-missing",
    1
  );
  assert(!result.ok, "missing program should fail");
  assert.equal(result.error, "No plan for today.");
  console.log("✓ missing program returns 'No plan for today.'");

  // Test 6: day with no active entry returns 'No plan for today.' (using typed deps fake)
  result = await loadStartProgram(
    {
      async fetchProgram() {
        return {
          data: {
            id: "prog-empty",
            started_on: "2026-10-20",
            deload_week: 4,
            week_offset: 0,
            program_days: [],
          },
          error: null,
        };
      },
    },
    "prog-empty",
    7
  );
  assert(!result.ok, "day index with no active day should fail");
  assert.equal(result.error, "No plan for today.");
  console.log("✓ day with no active entry returns 'No plan for today.'");

  console.log("\nAll load-start-program tests passed.");
})();
