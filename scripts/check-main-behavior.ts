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

// KB 22 two-miss
const kb22 = evaluateProgression({
  sets: sets(4, 10, 22),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 22, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "kg",
});

console.log("KB 22 two-miss (main b6c70094):", kb22.nextWorkingWeightKg);
console.log("  RAW 90% = 19.8");
console.log("  Expected: 18 (main) vs 20 (requirement)");
