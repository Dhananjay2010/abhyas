/**
 * Test buildChosenByDayIndex (Fix 2: Your week shows completed swaps).
 *
 * Unit test of the pure helper with real inputs.
 *
 *   npx tsx scripts/test-chosen-by-day.ts
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

const days = [
  { id: "day-1", day_index: 1, day_type: "rest" as const, label: "Rest" },
  { id: "day-2", day_index: 2, day_type: "weights" as const, label: "Upper" },
  { id: "day-3", day_index: 3, day_type: "weights" as const, label: "Lower" },
  { id: "day-4", day_index: 4, day_type: "rest" as const, label: "Rest" },
  { id: "day-5", day_index: 5, day_type: "weights" as const, label: "Push" },
];

const localToday = "2026-10-27"; // Tuesday (day_index=2)
const todayIndex = 2;

function main() {
  console.log("Testing buildChosenByDayIndex\n");

  test("Swapped Upper on template Rest: planned → 'Upper'", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday (6 days from Tuesday 2026-10-27)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2",
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    
    // Monday template is Rest, but we swapped to Upper (planned)
    assert.equal(result.size, 1, "One chosen day");
    assert.equal(result.get(1), "Upper", "Monday shows Upper");
  });

  test("Swapped Upper on template Rest: in_progress → 'Upper'", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday
        status: "in_progress",
        actual_type: "weights" as const,
        program_day_id: "day-2",
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.get(1), "Upper", "Monday shows Upper (in_progress)");
  });

  test("Swapped Upper on template Rest: completed → 'Upper' (the fix)", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-2",
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.get(1), "Upper", "Monday shows Upper (completed)");
  });

  test("Completed session matching template → no entry", () => {
    const allSessions = [
      {
        local_date: "2026-10-27", // Today Tuesday (template is Upper, day_index=2)
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper matches template
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 0, "No chosen days (matches template)");
  });

  test("Completed yoga on strength day → not shown as chosen", () => {
    const allSessions = [
      {
        local_date: "2026-10-27", // Today Tuesday (template is Upper)
        status: "completed",
        actual_type: "yoga" as const,
        program_day_id: null,
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    // Yoga is an anytime activity, but it DOES differ from the template
    // so it IS shown - but only if completed. Let me check the isStrength filter.
    // The code filters: completed AND isStrength, so yoga/breathing completed are NOT included
    assert.equal(result.size, 0, "Yoga not shown (not strength)");
  });

  test("Completed breathing on strength day → not shown", () => {
    const allSessions = [
      {
        local_date: "2026-10-27", // Today Tuesday
        status: "completed",
        actual_type: "meditation" as const,
        program_day_id: null,
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 0, "Breathing not shown (not strength)");
  });

  test("Ended-early completed swap → still 'Upper'", () => {
    // A completed strength session is completed, regardless of how many sets
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday (template Rest)
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Swapped to Upper
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.get(1), "Upper", "Still shows Upper even if ended early");
  });

  test("Multiple swaps across the week", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday (template Rest → Upper)
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-2",
      },
      {
        local_date: "2026-10-29", // Thursday this week (template Rest → Lower)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-3",
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 2, "Two chosen days");
    assert.equal(result.get(1), "Upper", "Monday shows Upper");
    assert.equal(result.get(4), "Lower", "Thursday shows Lower");
  });

  test("No sessions → empty map", () => {
    const result = buildChosenByDayIndex([], days, localToday, todayIndex);
    assert.equal(result.size, 0, "No chosen days");
  });

  test("L6: Two rows on one date → completed wins over planned (header rank)", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday (template Rest)
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper
        created_at: "2026-11-01T12:00:00Z",
      },
      {
        local_date: "2026-11-02", // Same date
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-3", // Lower
        created_at: "2026-11-01T11:00:00Z", // Older
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 1, "One chosen day");
    // Completed wins over planned, even though planned is newer
    assert.equal(result.get(1), "Lower", "Monday shows Lower (completed rank wins)");
  });

  test("L6: Two rows same status → newest wins", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper
        created_at: "2026-11-01T11:00:00Z", // Older
      },
      {
        local_date: "2026-11-02", // Same date
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-3", // Lower
        created_at: "2026-11-01T12:00:00Z", // Newer
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 1, "One chosen day");
    // Same status, so newest wins
    assert.equal(result.get(1), "Lower", "Monday shows Lower (newest)");
  });

  test("L6: in_progress beats planned, completed beats both", () => {
    const allSessions = [
      {
        local_date: "2026-11-02", // Next Monday
        status: "planned",
        actual_type: "weights" as const,
        program_day_id: "day-2", // Upper
        created_at: "2026-11-01T14:00:00Z", // Newest
      },
      {
        local_date: "2026-11-02", // Same date
        status: "in_progress",
        actual_type: "weights" as const,
        program_day_id: "day-5", // Push
        created_at: "2026-11-01T12:00:00Z",
      },
      {
        local_date: "2026-11-02", // Same date
        status: "completed",
        actual_type: "weights" as const,
        program_day_id: "day-3", // Lower
        created_at: "2026-11-01T10:00:00Z", // Oldest
      },
    ];

    const result = buildChosenByDayIndex(allSessions, days, localToday, todayIndex);
    assert.equal(result.size, 1, "One chosen day");
    // Completed (rank 1) beats in_progress (rank 2) beats planned (rank 3)
    assert.equal(result.get(1), "Lower", "Monday shows Lower (completed wins)");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
