#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";

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

const BENCH: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "push", isBodyweight: false, progressionChain: null, progressionRank: null };

console.log("\nRAW 90% Test Cases:\n");

const cases = [
  { weight: 22, equipmentIds: ["kettlebell"], label: "KB 22", expected: 20 },
  { weight: 13.75, equipmentIds: ["dumbbell"], label: "DB 13.75", expected: 12.5 },
  { weight: 5, equipmentIds: ["dumbbell"], label: "DB 5", expected: 5 },
  { weight: 30, equipmentIds: ["lat_pulldown"], label: "Pin 30", expected: 30 },
];

for (const c of cases) {
  const twoMiss = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: c.equipmentIds,
    unit: "kg",
  });
  
  const raw90 = c.weight * 0.9;
  const status = twoMiss.nextWorkingWeightKg === c.expected ? "✓" : "✗";
  console.log(`${status} ${c.label}: got ${twoMiss.nextWorkingWeightKg}, expected ${c.expected}, RAW 90%=${raw90.toFixed(2)}`);
}
