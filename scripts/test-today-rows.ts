/**
 * Test today's row building logic
 *
 *   npm run test:today-rows
 */
import { buildStartedSessionRows, buildTemplateRows } from "../src/lib/today/build-today-rows";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nToday rows: template preview (before start)");
{
  const template = [
    {
      order_index: 0,
      exercises: {
        name: "Bench Press",
        cue: "Retract scapula",
        metric: "reps" as const,
      },
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 180,
    },
  ];

  const rows = buildTemplateRows(template);

  check("template: uses target_reps_max", rows[0].repsMax === 12, `got ${rows[0].repsMax}`);
  check("template: key starts with 'p'", rows[0].key === "p0");
  check("template: not swapped", rows[0].swappedIn === false);
  check("template: not skipped", rows[0].skipped === false);
}

console.log("\nToday rows: started session, unfinished exercise");
{
  const sessionExercises = [
    {
      order_index: 0,
      exercise_id: "ex-1",
      exercises: {
        name: "Plank",
        cue: null,
        equipment_ids: [] as string[],
      },
      metric: "seconds" as const,
      planned_sets: 3,
      planned_reps_min: 20,
      planned_reps_max: 30,
      rest_seconds: 60,
      status: "pending" as const,
      swapped_from_exercise_id: null,
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: null, current_target_reps: 40 }],
  ]);

  const rows = buildStartedSessionRows(sessionExercises, progress);

  check("unfinished: progressed target shown when higher (planned 30s, progress 40 → 40s)", 
    rows[0].repsMax === 40, `got ${rows[0].repsMax}`);
  check("unfinished: key starts with 's'", rows[0].key === "s0");
}

console.log("\nToday rows: started session, finished exercise");
{
  const sessionExercises = [
    {
      order_index: 0,
      exercise_id: "ex-1",
      exercises: {
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"] as string[],
      },
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 120,
      status: "completed" as const,
      swapped_from_exercise_id: null,
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: null, current_target_reps: 14 }],
  ]);

  const rows = buildStartedSessionRows(sessionExercises, progress);

  check("finished: shows planned value, not progressed (planned 12, progress 14 → 12)",
    rows[0].repsMax === 12, `got ${rows[0].repsMax}, should use planned not progressed`);
}

console.log("\nToday rows: loaded exercise with progress");
{
  const sessionExercises = [
    {
      order_index: 0,
      exercise_id: "ex-1",
      exercises: {
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"] as string[],
      },
      metric: "reps" as const,
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 180,
      status: "pending" as const,
      swapped_from_exercise_id: null,
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: 80, current_target_reps: 14 }],
  ]);

  const rows = buildStartedSessionRows(sessionExercises, progress);

  check("loaded: ignores progressed target, uses planned (G5)",
    rows[0].repsMax === 12, `got ${rows[0].repsMax}, loaded exercises ignore progressed`);
}

console.log("\nToday rows: bodyweight with added weight");
{
  const sessionExercises = [
    {
      order_index: 0,
      exercise_id: "ex-1",
      exercises: {
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"] as string[],
      },
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 120,
      status: "pending" as const,
      swapped_from_exercise_id: null,
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: 10, current_target_reps: 14 }],
  ]);

  const rows = buildStartedSessionRows(sessionExercises, progress);

  check("bodyweight with added weight: uses planned, not progressed",
    rows[0].repsMax === 12, `got ${rows[0].repsMax}, added weight = loaded behavior`);
}

console.log("\nToday rows: swapped and skipped indicators");
{
  const sessionExercises = [
    {
      order_index: 0,
      exercise_id: "ex-1",
      exercises: {
        name: "Dumbbell Press",
        cue: null,
        equipment_ids: ["dumbbell"] as string[],
      },
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: "pending" as const,
      swapped_from_exercise_id: "ex-original",
    },
    {
      order_index: 1,
      exercise_id: "ex-2",
      exercises: {
        name: "Tricep Extension",
        cue: null,
        equipment_ids: ["cable_machine"] as string[],
      },
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 10,
      planned_reps_max: 15,
      rest_seconds: 60,
      status: "skipped" as const,
      swapped_from_exercise_id: null,
    },
  ];

  const progress = new Map();

  const rows = buildStartedSessionRows(sessionExercises, progress);

  check("swapped exercise: swappedIn is true", rows[0].swappedIn === true);
  check("skipped exercise: skipped is true", rows[1].skipped === true);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}
