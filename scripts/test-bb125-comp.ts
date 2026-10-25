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

const bb125First = evaluateProgression({
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

const bb125Two = evaluateProgression({
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

console.log(`BB 12.5 compound first-miss: ${bb125First.nextWorkingWeightKg} (expected HOLD at 12.5)`);
console.log(`BB 12.5 compound two-miss: ${bb125Two.nextWorkingWeightKg}`);
console.log(`Test comment says: "first 10 < two-miss floor 12.5"`);
console.log(`\nActual: first=${bb125First.nextWorkingWeightKg}, two=${bb125Two.nextWorkingWeightKg}`);
console.log(`First-miss candidate would be 10 (one step down)`);
console.log(`If two-miss floor is 10, then 10 < 10 is FALSE, so first-miss goes to 10`);
console.log(`If two-miss floor is 12.5, then 10 < 12.5 is TRUE, so first-miss holds at 12.5`);
