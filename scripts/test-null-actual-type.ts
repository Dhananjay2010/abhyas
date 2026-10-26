/**
 * Test null actual_type filtering with multiple rows on same date (C6).
 *
 * When two sessions exist for one date and one has null actual_type,
 * the header and week map must filter it out and pick the valid one.
 *
 *   npx tsx scripts/test-null-actual-type.ts
 */

import { strict as assert } from "node:assert";
import { buildChosenByDayIndex } from "../src/lib/today/chosen-by-day";

export {}; // Module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function main() {
  console.log("Testing null actual_type filtering\n");

  const days = [
    { id: "day-1", day_index: 1, day_type: "rest" as const, label: "Rest" },
    { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Upper" },
  ];

  test("C6: Two rows, one null actual_type → pick valid one", () => {
    const sessions = [
      {
        local_date: "2026-11-02", // Monday (today, day_index 1)
        status: "planned",
        actual_type: null, // Invalid
        program_day_id: "day-2",
        created_at: "2026-11-01T13:00:00Z", // Newer
      },
      {
        local_date: "2026-11-02", // Same date
        status: "planned",
        actual_type: "weights" as const, // Valid
        program_day_id: "day-2",
        created_at: "2026-11-01T12:00:00Z", // Older
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, "2026-11-02", 1); // Monday is today
    // Template says Monday is Rest, session is Upper (weights)
    assert.equal(result.get(1), "Upper", "Should pick the row with valid actual_type");
  });

  test("C6: Both rows null actual_type → no entry", () => {
    const sessions = [
      {
        local_date: "2026-11-02", // Monday (today)
        status: "planned",
        actual_type: null,
        program_day_id: "day-2",
        created_at: "2026-11-01T13:00:00Z",
      },
      {
        local_date: "2026-11-02", // Same date
        status: "planned",
        actual_type: null,
        program_day_id: "day-1",
        created_at: "2026-11-01T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, "2026-11-02", 1);
    assert.equal(result.size, 0, "Should have no entry when all rows have null actual_type");
  });

  test("C6: One row null actual_type, other matches template → no entry", () => {
    const sessions = [
      {
        local_date: "2026-11-02", // Monday (today, template is Rest)
        status: "planned",
        actual_type: null, // Invalid
        program_day_id: "day-2",
        created_at: "2026-11-01T13:00:00Z",
      },
      {
        local_date: "2026-11-02", // Same date
        status: "planned",
        actual_type: "rest" as const, // Valid, matches template
        program_day_id: "day-1",
        created_at: "2026-11-01T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, "2026-11-02", 1);
    // Valid row matches template (Rest), so no difference to record
    assert.equal(result.size, 0, "Should have no entry when valid row matches template");
  });

  test("C6: Completed + null actual_type → skip both (null filtered)", () => {
    const sessions = [
      {
        local_date: "2026-11-02", // Monday (today)
        status: "completed",
        actual_type: "weights" as const, // Valid
        program_day_id: "day-2",
        created_at: "2026-11-01T13:00:00Z",
      },
      {
        local_date: "2026-11-02", // Same date
        status: "planned",
        actual_type: null, // Invalid, should be filtered out
        program_day_id: "day-1",
        created_at: "2026-11-01T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, "2026-11-02", 1);
    // Completed wins, null is filtered
    assert.equal(result.get(1), "Upper", "Should pick completed valid row, ignore null");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
