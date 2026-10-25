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

console.log("\nBB 12.5 test:\n");

const firstMiss = evaluateProgression({
  sets: sets(4, 10, 12.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

const twoMiss = evaluateProgression({
  sets: sets(4, 10, 12.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log(`BB 12.5 RAW 90% = ${12.5 * 0.9}`);
console.log(`BB 12.5 first-miss: ${firstMiss.nextWorkingWeightKg} (expected 12.5 hold)`);
console.log(`BB 12.5 two-miss: ${twoMiss.nextWorkingWeightKg}`);
console.log(`\nFirst-miss candidate would be: one step down from 12.5 = 10`);
console.log(`Two-miss floor should be: 12.5 (no loadable value >= 11.25 and < 12.5)`);
console.log(`So first-miss should hold because 10 < 12.5`);
