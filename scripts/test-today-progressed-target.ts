/**
 * Test that buildTemplateRows uses effectiveRepsMax for progressed targets (Mutant D)
 */
import { buildTemplateRows } from "../src/lib/today/build-today-rows";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nbuildTemplateRows: progressed bodyweight target");

const template: Array<{
  order_index: number;
  exercise_id: string | null;
  exercises: {
    name: string;
    cue: string | null;
    metric: string | null;
    equipment_ids: string[];
  } | null;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
}> = [
  {
    order_index: 1,
    exercise_id: "ex-1",
    exercises: {
      name: "Pull-up",
      cue: null,
      metric: "reps",
      equipment_ids: ["pull_up_bar"],
    },
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const progress = new Map([
  ["ex-1", { current_working_weight_kg: null, current_target_reps: 14 }],
]);

const rows = buildTemplateRows(template, progress);

check("row exists", rows.length === 1);
check("repsMax is 14 (progressed), not 12 (planned)", rows[0].repsMax === 14,
  `got ${rows[0].repsMax}, expected 14 from effectiveRepsMax`);
check("WITHOUT effectiveRepsMax, would show 12", rows[0].repsMax !== 12,
  "mutant D would show 12, real code shows 14");

console.log("\nbuildTemplateRows: loaded exercise uses planned target");

const template2: Array<{
  order_index: number;
  exercise_id: string | null;
  exercises: {
    name: string;
    cue: string | null;
    metric: string | null;
    equipment_ids: string[];
  } | null;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number | null;
}> = [
  {
    order_index: 1,
    exercise_id: "ex-2",
    exercises: {
      name: "Barbell Row",
      cue: null,
      metric: "reps",
      equipment_ids: ["barbell"],
    },
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const progress2 = new Map([
  ["ex-2", { current_working_weight_kg: 60, current_target_reps: 14 }],
]);

const rows2 = buildTemplateRows(template2, progress2);

check("loaded row uses planned max", rows2[0].repsMax === 12,
  `got ${rows2[0].repsMax}, expected 12 for loaded exercise`);

if (failures > 0) {
  console.log(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
