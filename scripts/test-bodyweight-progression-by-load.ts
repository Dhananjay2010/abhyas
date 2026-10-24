/**
 * Behavior test for bodyweight progresses by load instead of reps
 * 
 * Test that the incrementFor and addedWeightStep functions return correct
 * values for bodyweight exercises, and verify progression chooses rep
 * progression over weight for unloaded bodyweight movements.
 */
import { incrementFor, addedWeightStep, nextBest } from "../src/lib/program/progression";
import type { ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nadded Weight step: bodyweight movements use smaller increments");

const pullupMeta: ExerciseMeta = {
  isBodyweight: true,
  metric: "reps",
  progressionChain: "bw_pullup_chain",
  progressionRank: 1,
  mechanic: "compound",
  movementPattern: "vertical_pull",
  equipmentIds: ["pull_up_bar"],
};

const pullupStep = addedWeightStep(pullupMeta);
check("pull-up added weight step is small", pullupStep === 1.25,
  `got ${pullupStep}, expected 1.25 for upper bodyweight`);

const squatMeta: ExerciseMeta = {
  isBodyweight: false,
  metric: "reps",
  progressionChain: null,
  progressionRank: null,
  mechanic: "compound",
  movementPattern: "squat",
  equipmentIds: ["barbell"],
};

const squatIncrement = incrementFor(squatMeta);
check("squat increment is larger", squatIncrement === 5,
  `got ${squatIncrement}, expected 5 for lower compound`);

console.log("\nnextBest: unloaded bodyweight progresses by reps");

// Simulate hitting the rep target on unloaded bodyweight - beating a previous best
const unloadedResult = nextBest(
  [{ reps: 14, weightKg: null, durationSeconds: null }],
  {
    bestWeightKg: 0,
    bestReps: 12,
    bestE1rm: null,
  },
  pullupMeta
);

check("reps recorded", unloadedResult.bestReps === 14,
  `got ${unloadedResult.bestReps}, expected 14 reps`);
check("weight stays zero for bodyweight", unloadedResult.bestWeightKg === 0,
  `got ${unloadedResult.bestWeightKg}, unloaded bodyweight has no weight`);
check("personal best is reps", unloadedResult.personalBest?.kind === "reps",
  `got ${unloadedResult.personalBest?.kind}, unloaded bodyweight progresses by reps`);

console.log("\nnextBest: loaded exercise progresses by weight");

const loadedResult = nextBest(
  [{ reps: 12, weightKg: 62.5, durationSeconds: null }],
  {
    bestWeightKg: 60,
    bestReps: 10,
    bestE1rm: 66,
  },
  squatMeta
);

check("weight recorded", loadedResult.bestWeightKg === 62.5,
  `got ${loadedResult.bestWeightKg}, expected 62.5`);
check("personal best is weight", loadedResult.personalBest?.kind === "weight",
  `got ${loadedResult.personalBest?.kind}, loaded exercise progresses by weight`);

console.log("\nnextBest: bodyweight with added weight records weight");

const weightedResult = nextBest(
  [{ reps: 12, weightKg: 6.25, durationSeconds: null }],
  {
    bestWeightKg: 5,
    bestReps: 10,
    bestE1rm: 5.5,
  },
  pullupMeta
);

check("added weight recorded", weightedResult.bestWeightKg === 6.25,
  `got ${weightedResult.bestWeightKg}, expected 6.25 (small step from 5)`);
check("personal best is weight", weightedResult.personalBest?.kind === "weight",
  `got ${weightedResult.personalBest?.kind}, bodyweight with weight progresses by weight`);

if (failures > 0) {
  console.log(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
