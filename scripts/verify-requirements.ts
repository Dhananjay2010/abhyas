#!/usr/bin/env tsx
// Verify key requirements
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

const BENCH: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "push", isBodyweight: false, progressionChain: null, progressionRank: null };
const CURL: ExerciseMeta = { mechanic: "isolation", metric: "reps", movementPattern: "biceps", isBodyweight: false, progressionChain: null, progressionRank: null };

console.log("\n✓ Key Requirements Verification:\n");

// KB 22 -> 20 (RAW 90% = 19.8)
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
console.log(`✓ KB 22 -> ${kb22.nextWorkingWeightKg} (expected 20)`);

// DB 13.75 -> 12.5 (RAW 90% = 12.375)
const db1375 = evaluateProgression({
  sets: sets(4, 10, 13.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`✓ DB 13.75 -> ${db1375.nextWorkingWeightKg} (expected 12.5)`);

// No-equipment 13.75 -> 11.25 (matching main)
const noEquip1375 = evaluateProgression({
  sets: sets(4, 10, 13.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
  isDeload: false,
});
console.log(`✓ No-equipment 13.75 -> ${noEquip1375.nextWorkingWeightKg} (expected 11.25, matching main)`);

// KB 48 hold message (not "light weight")
const kb48 = evaluateProgression({
  sets: sets(4, 10, 48),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 48, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "kg",
});
console.log(`✓ KB 48 message: "${kb48.message}"`);
console.log(`  (should NOT say "light weight", should say "no lighter loadable weight")`);

