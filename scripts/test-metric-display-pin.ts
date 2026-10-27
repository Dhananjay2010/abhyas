#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

const BODYWEIGHT: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const result = evaluateProgression({
  sets: [{reps: 12, weightKg: 5, durationSeconds: null}, {reps: 12, weightKg: 5, durationSeconds: null}, {reps: 12, weightKg: 5, durationSeconds: null}],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BODYWEIGHT,
  state: {currentWorkingWeightKg: 5, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: 5, bestReps: 12, bestE1rm: null, totalSessions: 5, weightAtFailureStartKg: null},
  isDeload: false,
  equipmentIds: undefined,
  units: "metric",
});

console.log('Next weight:', result.nextWorkingWeightKg);
console.log('Message:', result.message);

if (result.nextWorkingWeightKg !== 6.25) {
  console.log(`FAIL: expected 6.25, got ${result.nextWorkingWeightKg}`);
  process.exit(1);
}

if (result.message !== "All sets at the top of the range — up to 6.25 kg.") {
  console.log(`FAIL: expected "All sets at the top of the range — up to 6.25 kg.", got "${result.message}"`);
  process.exit(1);
}

console.log('✅ Metric display shows plain kg (6.25 kg, not 6.3 kg)');
