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

const firstMiss = evaluateProgression({
  sets: sets(4, 10, 30),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["lat_pulldown"],
  unit: "kg",
});

const twoMiss = evaluateProgression({
  sets: sets(4, 10, 30),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 30, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["lat_pulldown"],
  unit: "kg",
});

console.log(`Pin 30 first-miss: ${firstMiss.nextWorkingWeightKg}`);
console.log(`Pin 30 two-miss: ${twoMiss.nextWorkingWeightKg}`);
console.log(`Invariant: ${firstMiss.nextWorkingWeightKg} >= ${twoMiss.nextWorkingWeightKg}? ${firstMiss.nextWorkingWeightKg >= twoMiss.nextWorkingWeightKg}`);
