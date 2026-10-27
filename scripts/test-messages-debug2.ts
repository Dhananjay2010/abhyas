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

const sets = [
  { reps: 7, weightKg: 72.5 },
  { reps: 12, weightKg: 70 },
  { reps: 12, weightKg: 70 },
  { reps: 12, weightKg: 70 },
  { reps: 12, weightKg: 70 },
];

// With equipment (first miss from mode 70 kg → 67.5 kg)
const withEquip = evaluateProgression({
  sets,
  plannedSets: 5,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  equipmentIds: ["barbell"],
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
  isDeload: false,
});

console.log("Test 1: With equipment (NO UNIT)");
console.log(`  Message: "${withEquip.message}"`);
console.log(`  Next: ${withEquip.nextWorkingWeightKg} kg`);
console.log();
