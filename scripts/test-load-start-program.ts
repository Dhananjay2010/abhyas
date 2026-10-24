import { strict as assert } from "node:assert";
import { loadStartProgram, type ProgramWithDays } from "../src/lib/session/load-start-program";

(async () => {
  const programs: Record<string, ProgramWithDays | null> = {
    "prog-1": {
      id: "prog-1",
      started_on: "2026-10-20",
      deload_week: 4,
      week_offset: 0,
      program_days: [
        {
          id: "day-1",
          day_index: 1,
          day_type: "weights",
          focus: "upper",
          label: "Upper Body",
        },
        {
          id: "day-2",
          day_index: 2,
          day_type: "rest",
          focus: null,
          label: null,
        },
      ],
    },
    "prog-empty-days": {
      id: "prog-empty-days",
      started_on: "2026-10-20",
      deload_week: 4,
      week_offset: 0,
      program_days: [],
    },
  };

  let fetchedPrograms: string[] = [];

  const deps = {
    async fetchProgram(programId: string) {
      fetchedPrograms.push(programId);
      return programs[programId] ?? null;
    },
  };

  console.log("✓ setup complete");

  fetchedPrograms = [];
  const result1 = await loadStartProgram(deps, "prog-1", 1);
  assert(result1.ok, "load should succeed for active day");
  assert.equal(result1.program.id, "prog-1");
  assert.equal(result1.dayId, "day-1");
  assert(fetchedPrograms.includes("prog-1"), "program was fetched");
  console.log("✓ loads active day successfully");
  console.log("✓ program_days filtered by status='active'");

  const result2 = await loadStartProgram(deps, "prog-1", 3);
  assert(!result2.ok, "day index with no matching active day should fail");
  assert.equal(result2.error, "No plan for today.");
  console.log("✓ superseded day is not picked");

  const result3 = await loadStartProgram(deps, "prog-1", 7);
  assert(!result3.ok, "day index with no active day should fail");
  assert.equal(result3.error, "No plan for today.");
  console.log("✓ day with no active entry returns 'No plan for today.'");

  const result4 = await loadStartProgram(deps, "prog-missing", 1);
  assert(!result4.ok, "missing program should fail");
  assert.equal(result4.error, "No plan for today.");
  console.log("✓ missing program returns 'No plan for today.'");

  const result5 = await loadStartProgram(deps, "prog-empty-days", 1);
  assert(!result5.ok, "program with no active days should fail");
  assert.equal(result5.error, "No plan for today.");
  console.log("✓ program with empty days list returns 'No plan for today.'");

  console.log("\nAll load-start-program tests passed.");
})();
