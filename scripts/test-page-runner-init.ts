/**
 * Test page.tsx runner initialization logic via buildRunnerInit
 *
 *   npm run test:page-runner-init
 */
import { buildRunnerInit } from "../src/lib/session/build-runner-init";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nRunner init: loaded exercise (has progress)");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: "pending" as const,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Deadlift",
        cue: null,
        equipment_ids: ["barbell"] as const,
        mechanic: "compound",
        movement_pattern: "hinge",
        primary_muscles: ["hamstrings"] as const,
      },
      session_sets: [],
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: 60, current_target_reps: 10 }],
  ]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("working weight is from progress", exercises[0].workingWeightKg === 60, `got ${exercises[0].workingWeightKg}`);
  check("loaded uses progressed target when lower", exercises[0].repsMax === 12, `got ${exercises[0].repsMax}, planned=12, progressed=10`);
  check("suggested weight exists", exercises[0].suggestedWeightKg !== null, `got ${exercises[0].suggestedWeightKg}`);
}

console.log("\nRunner init: bodyweight exercise with progress");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: "pending" as const,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"] as const,
        mechanic: "compound",
        movement_pattern: "other",
        primary_muscles: ["lats"] as const,
      },
      session_sets: [],
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: null, current_target_reps: 14 }],
  ]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("bodyweight: working weight is null", exercises[0].workingWeightKg === null, `got ${exercises[0].workingWeightKg}`);
  check("bodyweight uses progressed target when higher", exercises[0].repsMax === 14, `got ${exercises[0].repsMax}, planned=12`);
}

console.log("\nRunner init: no progress record");
{
  const rows = [
    {
      id: "se-1",
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 90,
      status: "pending" as const,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Squat",
        cue: null,
        equipment_ids: ["barbell"] as const,
        mechanic: "compound",
        movement_pattern: "squat",
        primary_muscles: ["quads"] as const,
      },
      session_sets: [],
    },
  ];

  const progress = new Map();

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("no progress: working weight is null", exercises[0].workingWeightKg === null, `got ${exercises[0].workingWeightKg}`);
  check("no progress: uses planned max", exercises[0].repsMax === 12, `got ${exercises[0].repsMax}`);
}

console.log("\nRunner init: equipment classification");
{
  const bodyweightRow = {
    id: "se-1",
    metric: "reps" as const,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    status: "pending" as const,
    feel: null,
    exercises: {
      id: "ex-1",
      name: "Push-up",
      cue: null,
      equipment_ids: [] as const,
      mechanic: "compound",
      movement_pattern: "other",
      primary_muscles: ["chest"] as const,
    },
    session_sets: [],
  };

  const pullUpRow = {
    ...bodyweightRow,
    id: "se-2",
    exercises: {
      id: "ex-2",
      name: "Pull-up",
      cue: null,
      equipment_ids: ["pull_up_bar"] as const,
      mechanic: "compound",
      movement_pattern: "other",
      primary_muscles: ["lats"] as const,
    },
  };

  const barbellRow = {
    ...bodyweightRow,
    id: "se-3",
    exercises: {
      id: "ex-3",
      name: "Squat",
      cue: null,
      equipment_ids: ["barbell"] as const,
      mechanic: "compound",
      movement_pattern: "squat",
      primary_muscles: ["quads"] as const,
    },
  };

  const exercises = buildRunnerInit([bodyweightRow, pullUpRow, barbellRow], new Map(), true, false);

  check("empty equipment is bodyweight", exercises[0].isBodyweight === true);
  check("pull-up bar is bodyweight", exercises[1].isBodyweight === true);
  check("barbell is not bodyweight", exercises[2].isBodyweight === false);
}

console.log("\nG5 and P-series tests");
{
  // G5: loaded ignores progressed
  const loadedRow = {
    id: "se-1",
    metric: "reps" as const,
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 90,
    status: "pending" as const,
    feel: null,
    exercises: {
      id: "ex-1",
      name: "Bench",
      cue: null,
      equipment_ids: ["barbell"] as const,
      mechanic: "compound",
      movement_pattern: "other",
      primary_muscles: ["chest"] as const,
    },
    session_sets: [],
  };

  const progress = new Map([["ex-1", { current_working_weight_kg: 60, current_target_reps: 14 }]]);

  const exercises = buildRunnerInit([loadedRow], progress, true, false);
  check("G5: loaded ignores progressed, uses planned", exercises[0].repsMax === 12, `got ${exercises[0].repsMax}, should ignore progressed=14`);

  // P-series: bodyweight uses progressed when higher
  const bwRow = {
    ...loadedRow,
    exercises: {
      id: "ex-2",
      name: "Pull-up",
      cue: null,
      equipment_ids: ["pull_up_bar"] as const,
      mechanic: "compound",
      movement_pattern: "other",
      primary_muscles: ["lats"] as const,
    },
  };

  const bwProgress = new Map([["ex-2", { current_working_weight_kg: null, current_target_reps: 14 }]]);
  const bwExercises = buildRunnerInit([bwRow], bwProgress, true, false);
  check("P-series: bodyweight uses progressed when higher", bwExercises[0].repsMax === 14, `got ${bwExercises[0].repsMax}, should use progressed=14`);

  // P1: progress exists → use its weight
  check("P1: progress exists → use its weight", exercises[0].workingWeightKg === 60, `got ${exercises[0].workingWeightKg}`);

  // P2: no progress → weight is null
  const noProgressExercises = buildRunnerInit([loadedRow], new Map(), true, false);
  check("P2: no progress → weight is null", noProgressExercises[0].workingWeightKg === null, `got ${noProgressExercises[0].workingWeightKg}`);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}
