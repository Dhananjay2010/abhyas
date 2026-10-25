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

const CURL: ExerciseMeta = { mechanic: "isolation", metric: "reps", movementPattern: "biceps", isBodyweight: false, progressionChain: null, progressionRank: null };

const firstMiss = evaluateProgression({
  sets: sets(4, 10, 2.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

const twoMiss = evaluateProgression({
  sets: sets(4, 10, 2.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log(`BB 2.75 kg isolation:`);
console.log(`  First-miss: ${firstMiss.nextWorkingWeightKg} (expected 2.5)`);
console.log(`  Two-miss: ${twoMiss.nextWorkingWeightKg} (expected 2.5)`);
console.log(`  RAW 90% = ${2.75 * 0.9}`);
