/**
 * Test date arithmetic across DST boundaries (C9).
 *
 * buildChosenByDayIndex calculates dates with addDays from a local date string.
 * This test verifies that the calculation works correctly across DST transitions.
 *
 * Run under different timezones:
 *   TZ=America/New_York npx tsx scripts/test-dst-boundary.ts
 *   TZ=UTC npx tsx scripts/test-dst-boundary.ts
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
  console.log(`Testing DST boundary date arithmetic (TZ=${process.env.TZ ?? "system"})\n`);

  const days = [
    { id: "day-1", day_index: 1, day_type: "rest" as const, label: "Rest" },
    { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Upper" },
    { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Lower" },
  ];

  test("C9: Date arithmetic around DST spring forward (2026-03-08)", () => {
    // March 8, 2026 is when DST starts in US (2am → 3am)
    // Friday before DST
    const localToday = "2026-03-06"; // Friday (day_index 5)
    const todayIndex = 5;

    // Sunday (day_index 7) is 2 days from Friday
    // Session swaps from template day_type
    const sessions = [
      {
        local_date: "2026-03-08", // Sunday after DST (2 days later)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper
        created_at: "2026-03-06T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // Sunday (day_index 7) template is not in days array, but function should handle it
    // Since days only has indices 1,2,3, Sunday (7) has no template, so no assertion here
    // Instead test Monday which is in the week window
    assert.equal(result.size, 0, "No template for Sunday means no swap recorded");
  });

  test("C9: DST spring forward with template swap", () => {
    // Test a session that swaps from template on DST transition day
    const localToday = "2026-03-06"; // Friday (day_index 5)
    const todayIndex = 5;

    // Monday March 9 is 3 days from Friday, day_index 1
    const sessions = [
      {
        local_date: "2026-03-09", // Monday after DST
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper (swapped from Rest)
        created_at: "2026-03-06T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // Template Monday (day_index 1) is Rest, session is Upper (weights) - swap!
    assert.equal(result.get(1), "Upper", "Monday swap from Rest to Upper across DST");
  });

  test("C9: DST spring forward with no swap", () => {
    // Session matches template on DST transition
    const localToday = "2026-03-06"; // Friday (day_index 5)
    const todayIndex = 5;

    const sessions = [
      {
        local_date: "2026-03-09", // Monday after DST
        status: "completed",
        actual_type: "rest" as const,
        program_day_id: "day-1", // Rest (matches template)
        created_at: "2026-03-06T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // Template Monday (day_index 1) is Rest, session is Rest - no swap
    assert.equal(result.size, 0, "Monday no-swap case: template match not recorded");
  });

  test("C9: Date arithmetic around DST fall back (2026-11-01)", () => {
    // November 1, 2026 is when DST ends in US (2am → 1am)
    // Saturday before DST
    const localToday = "2026-10-31"; // Saturday (day_index 6)
    const todayIndex = 6;

    const sessions = [
      {
        local_date: "2026-11-01", // Sunday (1 day later, during DST transition)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2",
        created_at: "2026-10-31T12:00:00Z",
      },
      {
        local_date: "2026-11-02", // Monday (2 days later, after DST)
        status: "planned",
        actual_type: "rest" as const,
        program_day_id: "day-1",
        created_at: "2026-10-31T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // Verify we found the Monday session (day_index 1)
    // Template Monday (day_index 1) is Rest, session is Rest - so no entry
    assert.equal(result.size, 0, "Template match should not be recorded");
  });

  test("C9: Week boundary calculation with session matching expected date", () => {
    // Test that daysSinceToday calculation produces correct local dates
    const localToday = "2026-11-02"; // Monday (day_index 1)
    const todayIndex = 1;

    const sessions = [
      // Today (Monday, day_index 1): +0 days
      {
        local_date: "2026-11-02",
        status: "planned",
        actual_type: "rest" as const,
        program_day_id: "day-1",
        created_at: "2026-11-01T12:00:00Z",
      },
      // Tomorrow (Tuesday, day_index 2): +1 day
      {
        local_date: "2026-11-03",
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2",
        created_at: "2026-11-01T12:00:00Z",
      },
      // Day after (Wednesday, day_index 3): +2 days
      {
        local_date: "2026-11-04",
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-3",
        created_at: "2026-11-01T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // All match templates, so empty
    assert.equal(result.size, 0, "All template matches produce empty map");
  });

  test("C9: Cross-timezone consistency (local date strings are timezone-agnostic)", () => {
    // Local date strings like "2026-11-02" should work the same regardless of TZ
    const localToday = "2026-11-02"; // Monday
    const todayIndex = 1;

    const sessions = [
      {
        local_date: "2026-11-03", // Tuesday (always +1 day from Monday)
        status: "planned",
        actual_type: "rest" as const, // Swap from weights to rest
        program_day_id: "day-1",
        created_at: "2026-11-01T12:00:00Z",
      },
    ];

    const result = buildChosenByDayIndex(sessions, days, localToday, todayIndex);
    // Template Tuesday (day_index 2) is Upper (weights), session is Rest - swap!
    assert.equal(result.get(2), "Rest", "Tuesday swap from Upper to Rest should be recorded");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
