#!/usr/bin/env tsx
/**
 * Test buildTodayRowsForProgram (T1, T2).
 * 
 * Verifies the call-site wiring:
 * - T1: isDeload is computed as week === deload_week (not hardcoded false)
 * - T2: buildTodayRows is called (not skipped)
 * 
 * Mutants T1, T2 must FAIL this test.
 */

import { buildTodayRowsForProgram, type BuildTodayRowsForProgramInput } from "@/lib/today/build-today-rows-for-program";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

async function main() {
  console.log("Test buildTodayRowsForProgram (T1, T2)\n");

  const template = [
    {
      order_index: 0,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
      exercises: {
        name: "Bench Press",
        cue: "Keep shoulders back",
        metric: "reps",
      },
    },
    {
      order_index: 1,
      target_sets: 5,
      target_reps_min: 10,
      target_reps_max: 15,
      rest_seconds: 120,
      exercises: {
        name: "Dumbbell Bench",
        cue: null,
        metric: "reps",
      },
    },
  ];

  const program = {
    started_on: "2026-10-01",
    week_offset: 3,
    deload_week: 4,
  };

  console.log("Case 1: Deload week (week 4)\n");

  // Week 4 is deload (week_offset 3 means we start at week 4)
  // Day 0 (Oct 1) = week 4 (3 + 0 + 1 = 4)
  const deloadDate = "2026-10-05"; // Day 4 in week 4
  const deloadInput: BuildTodayRowsForProgramInput = {
    actual: null,
    template,
    program,
    localToday: deloadDate,
  };

  const deloadRows = buildTodayRowsForProgram(deloadInput);

  check("2 exercises returned", deloadRows.length === 2);
  
  // T1: Must halve sets in deload week (4 → 2, 5 → 3)
  check(
    "T1: Bench Press deload (4 → 2 sets)",
    deloadRows[0].sets === 2,
    `got ${deloadRows[0].sets}, expected 2`,
  );

  check(
    "T2: Dumbbell deload (5 → 3 sets)",
    deloadRows[1].sets === 3,
    `got ${deloadRows[1].sets}, expected 3`,
  );

  check("Bench reps unchanged (8-12)", deloadRows[0].repsMin === 8 && deloadRows[0].repsMax === 12);
  check("Dumbbell reps unchanged (10-15)", deloadRows[1].repsMin === 10 && deloadRows[1].repsMax === 15);

  console.log("\nCase 2: Normal week (week 5)\n");

  // Week 5 is normal (not deload)
  // Day 7 (Oct 8) = week 5 (3 + 1 + 1 = 5)
  const normalDate = "2026-10-08"; // Day 0 in week 5
  const normalInput: BuildTodayRowsForProgramInput = {
    actual: null,
    template,
    program,
    localToday: normalDate,
  };

  const normalRows = buildTodayRowsForProgram(normalInput);

  check("2 exercises returned", normalRows.length === 2);

  // Normal week (week 5): sets unchanged
  check(
    "Normal week (week 5): Bench Press keeps 4 sets",
    normalRows[0].sets === 4,
    `got ${normalRows[0].sets}, expected 4`,
  );

  check(
    "Normal week (week 5): Dumbbell keeps 5 sets",
    normalRows[1].sets === 5,
    `got ${normalRows[1].sets}, expected 5`,
  );

  console.log("\nCase 3: No deload week (deload_week null)\n");

  // Program with no deload week
  const noDeloadProgram = {
    started_on: "2026-10-01",
    week_offset: 3,
    deload_week: null,
  };

  const noDeloadInput: BuildTodayRowsForProgramInput = {
    actual: null,
    template,
    program: noDeloadProgram,
    localToday: deloadDate, // Same date, but no deload week configured
  };

  const noDeloadRows = buildTodayRowsForProgram(noDeloadInput);

  check("2 exercises returned", noDeloadRows.length === 2);

  // No deload week: sets unchanged even in week 4
  check(
    "No deload week: Bench Press keeps 4 sets",
    noDeloadRows[0].sets === 4,
    `got ${noDeloadRows[0].sets}, expected 4`,
  );

  check(
    "No deload week: Dumbbell keeps 5 sets",
    noDeloadRows[1].sets === 5,
    `got ${noDeloadRows[1].sets}, expected 5`,
  );

  console.log("\n✅ All buildTodayRowsForProgram tests passed");
  console.log("\nMutants covered:");
  console.log("  T1: passing false instead of week === deload_week → FAILS deload check");
  console.log("  T2: skipping buildTodayRows → FAILS (no rows returned)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
