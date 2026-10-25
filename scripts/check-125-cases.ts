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
const BENCH: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "push", isBodyweight: false, progressionChain: null, progressionRank: null };

// BB isolation 12.5 kg
const bb125Iso = evaluateProgression({
  sets: sets(4, 10, 12.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});
console.log(`BB 12.5 isolation first-miss: ${bb125Iso.nextWorkingWeightKg} (expected HOLD at 12.5)`);
console.log(`  RAW 90% = ${12.5 * 0.9} = 11.25`);
console.log(`  Grid step = 1.25 (isolation)`);
console.log(`  ceil(11.25 / 1.25) * 1.25 = ${Math.ceil(11.25 / 1.25) * 1.25}`);
console.log(`  Fallback: floor((12.5-0.001) / 1.25) * 1.25 = ${Math.floor((12.5-0.001) / 1.25) * 1.25}`);

// DB 12.5 kg
const db125 = evaluateProgression({
  sets: sets(4, 10, 12.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`\nDB 12.5 first-miss: ${db125.nextWorkingWeightKg} (expected HOLD at 12.5)`);
console.log(`  RAW 90% = ${12.5 * 0.9} = 11.25`);
console.log(`  Grid step = 2.5`);
console.log(`  ceil(11.25 / 2.5) * 2.5 = ${Math.ceil(11.25 / 2.5) * 2.5}`);
console.log(`  Fallback: floor((12.5-0.001) / 2.5) * 2.5 = ${Math.floor((12.5-0.001) / 2.5) * 2.5}`);

// BB 12.5 kg compound
const bb125Comp = evaluateProgression({
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
console.log(`\nBB 12.5 compound first-miss: ${bb125Comp.nextWorkingWeightKg} (expected HOLD at 12.5)`);
console.log(`  RAW 90% = ${12.5 * 0.9} = 11.25`);
console.log(`  Grid step = 2.5 (compound)`);
console.log(`  Candidate = 10 (one step down)`);
console.log(`  Two-miss floor = ?`);
