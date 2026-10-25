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

const SWING: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "hinge", isBodyweight: false, progressionChain: null, progressionRank: null };

// Convert 16 lb to kg
const weightKg = 16 / 2.20462;
console.log(`KB 16 lb = ${weightKg.toFixed(2)} kg`);

const twoMiss = evaluateProgression({
  sets: sets(4, 10, weightKg),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: SWING,
  state: fresh({ currentWorkingWeightKg: weightKg, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "lb",
});

console.log(`Two-miss result: ${twoMiss.nextWorkingWeightKg} kg`);
console.log(`RAW 90% = ${weightKg * 0.9} kg`);
console.log(`In lb: ${twoMiss.nextWorkingWeightKg! * 2.20462} lb`);
