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

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const result = evaluateProgression({
  sets: sets(4, 10, 2.75),
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg" as WeightUnit,
});

console.log("DB 2.75 isolation first miss:");
console.log("  nextWeight:", result.nextWorkingWeightKg);
console.log("  outcome:", result.outcome);
console.log("  message:", result.message);
