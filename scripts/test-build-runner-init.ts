/**
 * Test buildRunnerInit (P1-P4 mutations)
 *
 *   npm run test:build-runner-init
 */
import { buildRunnerInit } from "../src/lib/session/build-runner-init";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nP1: uses progress working weight");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"],
        mechanic: "compound",
        movement_pattern: "squat",
        primary_muscles: ["quads"],
      },
    },
  ];

  const progress = new Map([["ex-1", { current_working_weight_kg: 60, current_target_reps: 10 }]]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("P1: uses progress weight", exercises[0].workingWeightKg === 60, `got ${exercises[0].workingWeightKg}`);
}

console.log("\nP2: uses correct progress field (not target_reps)");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"],
        mechanic: "compound",
        movement_pattern: "squat",
        primary_muscles: ["quads"],
      },
    },
  ];

  const progress = new Map([["ex-1", { current_working_weight_kg: 60, current_target_reps: 10 }]]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check(
    "P2: working weight is from current_working_weight_kg (not target_reps)",
    exercises[0].workingWeightKg === 60,
    `got ${exercises[0].workingWeightKg}, should be 60 not 10`
  );
}

console.log("\nP3: checks bodyweight equipment");
{
  const barbell = [
    {
      id: "se-1",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"],
        mechanic: "compound",
        movement_pattern: "squat",
        primary_muscles: ["quads"],
      },
    },
  ];

  const pullup = [
    {
      id: "se-2",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 5,
      planned_reps_max: 10,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-2",
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"],
        mechanic: "compound",
        movement_pattern: "vertical_pull",
        primary_muscles: ["lats"],
      },
    },
  ];

  const progress = new Map();

  const barbellExercises = buildRunnerInit(barbell, progress, true, false);
  const pullupExercises = buildRunnerInit(pullup, progress, true, false);

  check("P3: barbell is not bodyweight", barbellExercises[0].isBodyweight === false);
  check("P3: pull-up bar is bodyweight", pullupExercises[0].isBodyweight === true);
}

console.log("\nP4: passes progressedTarget to effectiveRepsMax");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 5,
      planned_reps_max: 10,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"],
        mechanic: "compound",
        movement_pattern: "vertical_pull",
        primary_muscles: ["lats"],
      },
    },
  ];

  const progress = new Map([["ex-1", { current_working_weight_kg: null, current_target_reps: 14 }]]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check(
    "P4: bodyweight uses progressed target (14) not planned (10)",
    exercises[0].repsMax === 14,
    `got ${exercises[0].repsMax}, planned=10, progressed=14`
  );
}

console.log("\nP-series: no progress returns null weight");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: null,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"],
        mechanic: "compound",
        movement_pattern: "squat",
        primary_muscles: ["quads"],
      },
    },
  ];

  const progress = new Map();

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("P-series: no progress → null weight", exercises[0].workingWeightKg === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
