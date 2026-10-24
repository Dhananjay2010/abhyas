/**
 * Test: Today deload prescription matches buildSessionExerciseRows output
 *
 * Behavior test: In a deload week, Today's computed prescription (through the
 * exported function Today uses) equals buildSessionExerciseRows' output, for:
 * - pull-up-bar row (reps trimmed, sets kept)
 * - hold (seconds trimmed)
 * - barbell row (sets cut)
 *
 *   npm run test:today-deload
 */

import { buildSessionExerciseRows } from "../src/lib/session/build-session-exercises";
import { loadReducibleFor } from "../src/lib/session/load-reducible";
import { resolveSessionTargets } from "../src/lib/program/session-targets";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

console.log("\n1. Pull-up-bar row: reps trimmed (8-12 → 5-8), sets kept (3 → 3)");
{
  const pullUpBarRow = {
    exercise_id: "pull-up-1",
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: {
      metric: "reps" as const,
      equipment_ids: ["pull_up_bar"],
    },
  };

  // buildSessionExerciseRows output
  const built = buildSessionExerciseRows([pullUpBarRow], { isDeload: true })[0];

  // Today's computed prescription
  const metric = pullUpBarRow.exercises.metric;
  const equipmentIds = pullUpBarRow.exercises.equipment_ids;
  const loadReducible = loadReducibleFor(equipmentIds, metric);
  const todayDose = resolveSessionTargets(
    {
      target_sets: pullUpBarRow.target_sets,
      target_reps_min: pullUpBarRow.target_reps_min,
      target_reps_max: pullUpBarRow.target_reps_max,
      rest_seconds: pullUpBarRow.rest_seconds,
    },
    { isDeload: true, loadReducible, metric },
  );

  check(
    "Pull-up-bar: buildSessionExerciseRows sets match Today dose",
    built.planned_sets === todayDose.sets,
    `built ${built.planned_sets} vs today ${todayDose.sets}`,
  );
  check(
    "Pull-up-bar: buildSessionExerciseRows reps_min match Today dose",
    built.planned_reps_min === todayDose.repsMin,
    `built ${built.planned_reps_min} vs today ${todayDose.repsMin}`,
  );
  check(
    "Pull-up-bar: buildSessionExerciseRows reps_max match Today dose",
    built.planned_reps_max === todayDose.repsMax,
    `built ${built.planned_reps_max} vs today ${todayDose.repsMax}`,
  );

  // Expected values
  check("Pull-up-bar: sets kept at 3", built.planned_sets === 3, `got ${built.planned_sets}`);
  check(
    "Pull-up-bar: reps trimmed 8-12 → 5-8",
    built.planned_reps_min === 5 && built.planned_reps_max === 8,
    `got ${built.planned_reps_min}-${built.planned_reps_max}`,
  );
}

console.log("\n2. Hold (plank): seconds trimmed (60s → 40s), sets kept (2 → 2)");
{
  const holdRow = {
    exercise_id: "plank-1",
    order_index: 1,
    target_sets: 2,
    target_reps_min: 60,
    target_reps_max: 60,
    rest_seconds: 60,
    exercises: {
      metric: "seconds" as const,
      equipment_ids: ["mat"],
    },
  };

  // buildSessionExerciseRows output
  const built = buildSessionExerciseRows([holdRow], { isDeload: true })[0];

  // Today's computed prescription
  const metric = holdRow.exercises.metric;
  const equipmentIds = holdRow.exercises.equipment_ids;
  const loadReducible = loadReducibleFor(equipmentIds, metric);
  const todayDose = resolveSessionTargets(
    {
      target_sets: holdRow.target_sets,
      target_reps_min: holdRow.target_reps_min,
      target_reps_max: holdRow.target_reps_max,
      rest_seconds: holdRow.rest_seconds,
    },
    { isDeload: true, loadReducible, metric },
  );

  check(
    "Hold: buildSessionExerciseRows sets match Today dose",
    built.planned_sets === todayDose.sets,
    `built ${built.planned_sets} vs today ${todayDose.sets}`,
  );
  check(
    "Hold: buildSessionExerciseRows reps_min match Today dose",
    built.planned_reps_min === todayDose.repsMin,
    `built ${built.planned_reps_min} vs today ${todayDose.repsMin}`,
  );
  check(
    "Hold: buildSessionExerciseRows reps_max match Today dose",
    built.planned_reps_max === todayDose.repsMax,
    `built ${built.planned_reps_max} vs today ${todayDose.repsMax}`,
  );

  // Expected values: 60 * 2/3 = 40
  check("Hold: sets kept at 2", built.planned_sets === 2, `got ${built.planned_sets}`);
  check(
    "Hold: seconds trimmed 60s → 40s",
    built.planned_reps_min === 40 && built.planned_reps_max === 40,
    `got ${built.planned_reps_min}s`,
  );
}

console.log("\n3. Barbell row: sets cut (5 → 3), reps unchanged (8-12 → 8-12)");
{
  const barbellRow = {
    exercise_id: "barbell-row-1",
    order_index: 2,
    target_sets: 5,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 120,
    exercises: {
      metric: "reps" as const,
      equipment_ids: ["barbell", "weight_plates"],
    },
  };

  // buildSessionExerciseRows output
  const built = buildSessionExerciseRows([barbellRow], { isDeload: true })[0];

  // Today's computed prescription
  const metric = barbellRow.exercises.metric;
  const equipmentIds = barbellRow.exercises.equipment_ids;
  const loadReducible = loadReducibleFor(equipmentIds, metric);
  const todayDose = resolveSessionTargets(
    {
      target_sets: barbellRow.target_sets,
      target_reps_min: barbellRow.target_reps_min,
      target_reps_max: barbellRow.target_reps_max,
      rest_seconds: barbellRow.rest_seconds,
    },
    { isDeload: true, loadReducible, metric },
  );

  check(
    "Barbell row: buildSessionExerciseRows sets match Today dose",
    built.planned_sets === todayDose.sets,
    `built ${built.planned_sets} vs today ${todayDose.sets}`,
  );
  check(
    "Barbell row: buildSessionExerciseRows reps_min match Today dose",
    built.planned_reps_min === todayDose.repsMin,
    `built ${built.planned_reps_min} vs today ${todayDose.repsMin}`,
  );
  check(
    "Barbell row: buildSessionExerciseRows reps_max match Today dose",
    built.planned_reps_max === todayDose.repsMax,
    `built ${built.planned_reps_max} vs today ${todayDose.repsMax}`,
  );

  // Expected values: 5 sets → 3 sets (applyDeload formula)
  check("Barbell row: sets cut 5 → 3", built.planned_sets === 3, `got ${built.planned_sets}`);
  check(
    "Barbell row: reps unchanged 8-12",
    built.planned_reps_min === 8 && built.planned_reps_max === 12,
    `got ${built.planned_reps_min}-${built.planned_reps_max}`,
  );
}

console.log("\n4. Non-deload week: no changes applied");
{
  const pullUpBarRow = {
    exercise_id: "pull-up-1",
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: {
      metric: "reps" as const,
      equipment_ids: ["pull_up_bar"],
    },
  };

  const built = buildSessionExerciseRows([pullUpBarRow], { isDeload: false })[0];

  const metric = pullUpBarRow.exercises.metric;
  const equipmentIds = pullUpBarRow.exercises.equipment_ids;
  const loadReducible = loadReducibleFor(equipmentIds, metric);
  const todayDose = resolveSessionTargets(
    {
      target_sets: pullUpBarRow.target_sets,
      target_reps_min: pullUpBarRow.target_reps_min,
      target_reps_max: pullUpBarRow.target_reps_max,
      rest_seconds: pullUpBarRow.rest_seconds,
    },
    { isDeload: false, loadReducible, metric },
  );

  check(
    "Non-deload: buildSessionExerciseRows match Today dose (sets)",
    built.planned_sets === todayDose.sets,
    `built ${built.planned_sets} vs today ${todayDose.sets}`,
  );
  check(
    "Non-deload: buildSessionExerciseRows match Today dose (reps)",
    built.planned_reps_min === todayDose.repsMin &&
      built.planned_reps_max === todayDose.repsMax,
    `built ${built.planned_reps_min}-${built.planned_reps_max} vs today ${todayDose.repsMin}-${todayDose.repsMax}`,
  );
  check(
    "Non-deload: values unchanged (3 sets, 8-12 reps)",
    built.planned_sets === 3 &&
      built.planned_reps_min === 8 &&
      built.planned_reps_max === 12,
    `got ${built.planned_sets} sets, ${built.planned_reps_min}-${built.planned_reps_max} reps`,
  );
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
