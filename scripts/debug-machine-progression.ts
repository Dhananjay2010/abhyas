#!/usr/bin/env tsx
/**
 * Debug version to see what's happening with Machine 12.5 kg
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "@/lib/program/progression";

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

let state: ProgressState = {
  currentWorkingWeightKg: 12.5,
  currentTargetReps: 10,
  consecutiveFailures: 0,
  bestWeightKg: 12.5,
  bestReps: 10,
  bestE1rm: null,
  totalSessions: 1,
  weightAtFailureStartKg: null,
};

const missingSets: LoggedSet[] = [
  { reps: 5, weightKg: 12.5 },
  { reps: 4, weightKg: 12.5 },
  { reps: 3, weightKg: 12.5 },
];

for (let missNum = 1; missNum <= 3; missNum++) {
  console.log(`\nMiss ${missNum} INPUT:`);
  console.log(`  currentWorkingWeightKg: ${state.currentWorkingWeightKg}`);
  console.log(`  consecutiveFailures: ${state.consecutiveFailures}`);
  console.log(`  weightAtFailureStartKg: ${state.weightAtFailureStartKg}`);

  const decision = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: state.currentWorkingWeightKg })),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta,
    state,
    isDeload: false,
    equipmentIds: ["machine_generic"],
  });

  console.log(`\nMiss ${missNum} OUTPUT:`);
  console.log(`  nextWorkingWeightKg: ${decision.nextWorkingWeightKg}`);
  console.log(`  consecutiveFailures: ${decision.consecutiveFailures}`);
  console.log(`  weightAtFailureStartKg: ${decision.weightAtFailureStartKg}`);
  console.log(`  outcome: ${decision.outcome}`);
  console.log(`  message: ${decision.message}`);

  state = {
    ...state,
    currentWorkingWeightKg: decision.nextWorkingWeightKg,
    consecutiveFailures: decision.consecutiveFailures,
    weightAtFailureStartKg: decision.weightAtFailureStartKg,
  };
}
