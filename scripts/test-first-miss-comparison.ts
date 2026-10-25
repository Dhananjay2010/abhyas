#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";
import { type WeightUnit } from "../src/lib/session/equipment-grid";

const sets = (n: number, reps: number, w: number) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "push",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const cases = [
  { weight: 12.5, equipmentIds: ["barbell"], unit: "kg" as WeightUnit, meta: BENCH, label: "BB 12.5 compound" },
  { weight: 16, equipmentIds: ["kettlebell"], unit: "kg" as WeightUnit, meta: BENCH, label: "KB 16 compound" },
  { weight: 12, equipmentIds: ["kettlebell"], unit: "kg" as WeightUnit, meta: CURL, label: "KB 12 isolation" },
  { weight: 24, equipmentIds: ["kettlebell"], unit: "kg" as WeightUnit, meta: BENCH, label: "KB 24 compound" },
  { weight: 2.75, equipmentIds: ["dumbbell"], unit: "kg" as WeightUnit, meta: CURL, label: "DB 2.75 isolation" },
];

console.log("First-miss comparison (current branch vs main b6c70094 expected):\n");
console.log("Input | Branch Result | Expected (main) | Match?");
console.log("------|---------------|-----------------|-------");

for (const c of cases) {
  const result = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: c.meta,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 0 }),
    isDeload: false,
    equipmentIds: c.equipmentIds,
    unit: c.unit,
  });
  
  const branchWeight = result.nextWorkingWeightKg;
  const branchMsg = result.message;
  
  // Expected from main based on PR #121 logic
  let expected = 0;
  if (c.label === "BB 12.5 compound") expected = 10;      // 12.5 -> 10 (one step, 20% exact)
  if (c.label === "KB 16 compound") expected = 14;        // 16 -> 14 (next bell down)
  if (c.label === "KB 12 isolation") expected = 10;       // 12 -> 10 (next bell down)
  if (c.label === "KB 24 compound") expected = 20;        // 24 -> 20 (next bell down)
  if (c.label === "DB 2.75 isolation") expected = 2.75;    // 2.75 -> 2.5 (one step down on 1.25 grid)
  
  const match = branchWeight === expected ? "✓" : "✗";
  console.log(`${c.label} ${c.weight} | ${branchWeight} | ${expected} | ${match}`);
}
