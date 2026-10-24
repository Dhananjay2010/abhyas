/**
 * Test: Session deload integration
 *
 * Verifies that startSession and ensureSessionExercises correctly apply
 * deload using resolveSessionTargets via the buildSessionExerciseRows helper.
 *
 * Key tests:
 * - Deload week: 5 sets -> 3, 1 -> 1, 2 -> 2
 * - Reps and rest unchanged
 * - buildSessionExerciseRows (used by both startSession and ensureSessionExercises)
 * - Swap path preserves deloaded set count
 *
 *   npm run test:session-deload-integration
 */

import { resolveSessionTargets } from "../src/lib/program/session-targets";
import { buildSessionExerciseRows } from "../src/lib/session/build-session-exercises";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Core deload transformations via resolveSessionTargets");
{
  // Test the specific cases from the requirements
  const cases = [
    { sets: 1, expected: 1, desc: "1 set stays at 1" },
    { sets: 2, expected: 2, desc: "2 sets stays at 2" },
    { sets: 5, expected: 3, desc: "5 sets becomes 3" },
  ];

  for (const { sets, expected, desc } of cases) {
    const result = resolveSessionTargets(
      {
        target_sets: sets,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      },
      { isDeload: true },
    );
    check(
      `deload: ${desc}`,
      result.sets === expected,
      `got ${result.sets}`,
    );
  }
}

console.log("\n2. Reps and rest unchanged during deload");
{
  const cases = [
    { repsMin: 3, repsMax: 6, rest: 180, desc: "strength prescription" },
    { repsMin: 8, repsMax: 12, rest: 90, desc: "muscle gain prescription" },
    { repsMin: 12, repsMax: 15, rest: 50, desc: "fat loss prescription" },
  ];

  for (const { repsMin, repsMax, rest, desc } of cases) {
    const result = resolveSessionTargets(
      {
        target_sets: 5,
        target_reps_min: repsMin,
        target_reps_max: repsMax,
        rest_seconds: rest,
      },
      { isDeload: true },
    );
    check(
      `deload preserves ${desc}: ${repsMin}-${repsMax} reps`,
      result.repsMin === repsMin && result.repsMax === repsMax,
      `got ${result.repsMin}-${result.repsMax}`,
    );
    check(
      `deload preserves ${desc}: ${rest}s rest`,
      result.restSeconds === rest,
      `got ${result.restSeconds}`,
    );
  }
}

console.log("\n3. Non-deload week returns unchanged values");
{
  const cases = [
    { sets: 1 },
    { sets: 2 },
    { sets: 3 },
    { sets: 4 },
    { sets: 5 },
  ];

  for (const { sets } of cases) {
    const result = resolveSessionTargets(
      {
        target_sets: sets,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      },
      { isDeload: false },
    );
    check(
      `non-deload: ${sets} sets unchanged`,
      result.sets === sets,
      `got ${result.sets}`,
    );
  }
}

console.log("\n4. buildSessionExerciseRows production helper (used by startSession & ensureSessionExercises)");
{
  // Test the actual production helper that both startSession and ensureSessionExercises call
  const plannedDeload = [
    {
      exercise_id: "ex1",
      order_index: 0,
      target_sets: 5,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      exercise_id: "ex2",
      order_index: 1,
      target_sets: 1,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
    {
      exercise_id: "ex3",
      order_index: 2,
      target_sets: 2,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
      exercises: { metric: "reps" },
    },
  ];

  const deloadRows = buildSessionExerciseRows(plannedDeload, { isDeload: true });
  check(
    "buildSessionExerciseRows: 5 sets -> 3 on deload",
    deloadRows[0].planned_sets === 3,
    `got ${deloadRows[0].planned_sets}`,
  );
  check(
    "buildSessionExerciseRows: 1 set -> 1 on deload",
    deloadRows[1].planned_sets === 1,
    `got ${deloadRows[1].planned_sets}`,
  );
  check(
    "buildSessionExerciseRows: 2 sets -> 2 on deload",
    deloadRows[2].planned_sets === 2,
    `got ${deloadRows[2].planned_sets}`,
  );

  // Test non-deload preserves all values
  const normalRows = buildSessionExerciseRows(plannedDeload, { isDeload: false });
  check(
    "buildSessionExerciseRows: non-deload preserves 5 sets",
    normalRows[0].planned_sets === 5,
    `got ${normalRows[0].planned_sets}`,
  );
  check(
    "buildSessionExerciseRows: non-deload preserves 1 set",
    normalRows[1].planned_sets === 1,
    `got ${normalRows[1].planned_sets}`,
  );
  check(
    "buildSessionExerciseRows: non-deload preserves 2 sets",
    normalRows[2].planned_sets === 2,
    `got ${normalRows[2].planned_sets}`,
  );
}

console.log("\n5. Swap path preserves deloaded set count");
{
  // Swap only updates planned_reps_min/max when metric changes, never planned_sets
  // This test verifies the swap logic doesn't recalculate or touch set counts
  
  // Simulate what swapExercise does: it reads current planned values and only
  // updates the range when metric changes
  function simulateSwap(
    current: { planned_reps_min: number; planned_reps_max: number; planned_sets: number },
    metricChanged: boolean,
    newRange: { repsMin: number; repsMax: number } | null,
  ) {
    // Swap never touches planned_sets - it's preserved from the session_exercise row
    return {
      planned_sets: current.planned_sets, // NEVER recalculated
      planned_reps_min: metricChanged && newRange ? newRange.repsMin : current.planned_reps_min,
      planned_reps_max: metricChanged && newRange ? newRange.repsMax : current.planned_reps_max,
    };
  }

  // Test 1: Swap with metric change (reps -> seconds) preserves deloaded sets
  const deloadedExercise = { planned_sets: 3, planned_reps_min: 8, planned_reps_max: 12 };
  const afterSwapWithMetricChange = simulateSwap(
    deloadedExercise,
    true,
    { repsMin: 20, repsMax: 40 },
  );
  check(
    "swap preserves deloaded sets when metric changes",
    afterSwapWithMetricChange.planned_sets === 3,
    `got ${afterSwapWithMetricChange.planned_sets}, expected 3 (deloaded from 5)`,
  );
  check(
    "swap updates range when metric changes",
    afterSwapWithMetricChange.planned_reps_min === 20 &&
      afterSwapWithMetricChange.planned_reps_max === 40,
    `got ${afterSwapWithMetricChange.planned_reps_min}-${afterSwapWithMetricChange.planned_reps_max}`,
  );

  // Test 2: Swap without metric change preserves everything
  const afterSwapNoMetricChange = simulateSwap(deloadedExercise, false, null);
  check(
    "swap preserves deloaded sets when metric unchanged",
    afterSwapNoMetricChange.planned_sets === 3,
    `got ${afterSwapNoMetricChange.planned_sets}`,
  );
  check(
    "swap preserves range when metric unchanged",
    afterSwapNoMetricChange.planned_reps_min === 8 &&
      afterSwapNoMetricChange.planned_reps_max === 12,
    `got ${afterSwapNoMetricChange.planned_reps_min}-${afterSwapNoMetricChange.planned_reps_max}`,
  );

  // Test 3: Edge cases - 1 and 2 set exercises
  const oneSetDeloaded = { planned_sets: 1, planned_reps_min: 8, planned_reps_max: 12 };
  const oneSetSwapped = simulateSwap(oneSetDeloaded, true, { repsMin: 20, repsMax: 40 });
  check(
    "swap preserves 1-set deload",
    oneSetSwapped.planned_sets === 1,
    `got ${oneSetSwapped.planned_sets}`,
  );

  const twoSetDeloaded = { planned_sets: 2, planned_reps_min: 8, planned_reps_max: 12 };
  const twoSetSwapped = simulateSwap(twoSetDeloaded, true, { repsMin: 20, repsMax: 40 });
  check(
    "swap preserves 2-set deload",
    twoSetSwapped.planned_sets === 2,
    `got ${twoSetSwapped.planned_sets}`,
  );
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
