/**
 * Test that pull-up bar exercises progress by reps (not load) through real progression path
 */
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";
import { isBodyweightEquipment } from "../src/lib/program/bodyweight";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nPull-up bar progression through real call path");

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "vertical_pull",
  metric: "reps",
  isBodyweight: isBodyweightEquipment(["pull_up_bar"]),
  progressionChain: "pullup_chain",
  progressionRank: 1,
  equipmentIds: ["pull_up_bar"],
};

check("isBodyweight is true for pull_up_bar", meta.isBodyweight === true,
  `got ${meta.isBodyweight}`);

const state: ProgressState = {
  currentWorkingWeightKg: null,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: 12,
  bestE1rm: null,
  totalSessions: 3,
};

// User completed 3x12 unloaded pull-ups
const result = evaluateProgression({
  sets: [
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta,
  state,
  isDeload: false,
});

check("progressed outcome", result.outcome === "progressed", `got ${result.outcome}`);
check("nextTargetReps is 14 (progresses by reps)", result.nextTargetReps === 14,
  `got ${result.nextTargetReps}`);
check("nextWorkingWeightKg is undefined (not progressing by load)", result.nextWorkingWeightKg === undefined,
  `got ${result.nextWorkingWeightKg}`);

console.log("\nPull-up bar WITH ADDED WEIGHT progresses by load");

const stateWithWeight: ProgressState = {
  currentWorkingWeightKg: 10,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 10,
  bestReps: 12,
  bestE1rm: null,
  totalSessions: 5,
};

// User completed 3x12 with 10kg added
const result2 = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 10 },
    { reps: 12, weightKg: 10 },
    { reps: 12, weightKg: 10 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta,
  state: stateWithWeight,
  isDeload: false,
});

check("progressed outcome", result2.outcome === "progressed", `got ${result2.outcome}`);
check("nextWorkingWeightKg increases (progresses by load)", 
  result2.nextWorkingWeightKg !== undefined && result2.nextWorkingWeightKg! > 10,
  `got ${result2.nextWorkingWeightKg}`);
check("nextTargetReps is repsMax (not reps++)", result2.nextTargetReps === 12 || result2.nextTargetReps === undefined,
  `got ${result2.nextTargetReps}`);

if (failures > 0) {
  console.log(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
