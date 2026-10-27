#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null, ...overrides };
}

// Test 1: With equipment first miss
const withEquip1 = evaluateProgression({
  sets: [{ reps: 7, weightKg: 72.5 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }],
  plannedSets: 5,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  equipmentIds: ["dumbbell"],
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
  isDeload: false,
  unit: "kg",
});

console.log("Test 1: With equipment first miss");
console.log(`  Message: "${withEquip1.message}"`);
console.log(`  Next: ${withEquip1.nextWorkingWeightKg} kg`);
console.log();

// Test 2: Without equipment hold
const noEquip1 = evaluateProgression({
  sets: [{ reps: 7, weightKg: 72.5 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }, { reps: 12, weightKg: 70 }],
  plannedSets: 5,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  equipmentIds: undefined,
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
  isDeload: false,
});

console.log("Test 2: Without equipment hold");
console.log(`  Message: "${noEquip1.message}"`);
console.log(`  Next: ${noEquip1.nextWorkingWeightKg} kg`);
console.log();

// Test 3: Hold at smallest
const smallest = evaluateProgression({
  sets: [{ reps: 7, weightKg: 7.5 }, { reps: 11, weightKg: 5 }, { reps: 11, weightKg: 5 }, { reps: 11, weightKg: 5 }, { reps: 11, weightKg: 5 }],
  plannedSets: 5,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  equipmentIds: ["dumbbell"],
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
  isDeload: false,
  unit: "kg",
});

console.log("Test 3: Hold at smallest");
console.log(`  Message: "${smallest.message}"`);
console.log(`  Next: ${smallest.nextWorkingWeightKg} kg`);
