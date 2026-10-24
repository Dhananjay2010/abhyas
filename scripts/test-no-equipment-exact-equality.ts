#!/usr/bin/env tsx
/**
 * Test: Exact equality with main for users with NO equipment info
 * 
 * Verifies that users with no equipment info get EXACTLY main's behavior,
 * byte-for-byte, across a comprehensive sweep of inputs.
 * 
 * Imports real progression functions from both main and branch.
 */

import { evaluateProgression as mainProgression } from "/tmp/main-progression";
import { evaluateProgression as branchProgression, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;
let checks = 0;

function check(label: string, mainVal: any, branchVal: any) {
  checks++;
  const ok = mainVal === branchVal;
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}: main=${mainVal}, branch=${branchVal}`);
  }
}

const UPPER_COMPOUND: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const LOWER_COMPOUND: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "squat",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const ISOLATION: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Testing exact equality with main for NO equipment inputs...\n");

// Test critical weights around boundaries
const criticalWeights = [
  2.5, 3.75, 5, 6.25, 7.5, 10, 12.5, 15, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200
];

for (const weight of criticalWeights) {
  const state = {
    currentWorkingWeightKg: weight,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: weight,
    bestReps: 12,
    bestE1rm: weight * 1.4,
    totalSessions: 3,
  };
  
  // Success case
  const mainSuccess = mainProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 12, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state,
    isDeload: false,
  });
  
  const branchSuccess = branchProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 12, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state,
    isDeload: false,
  });
  
  check(`${weight}kg success outcome`, mainSuccess.outcome, branchSuccess.outcome);
  check(`${weight}kg success weight`, mainSuccess.nextWorkingWeightKg, branchSuccess.nextWorkingWeightKg);
  
  // First miss
  const mainFirstMiss = mainProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state,
    isDeload: false,
  });
  
  const branchFirstMiss = branchProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state,
    isDeload: false,
  });
  
  check(`${weight}kg first miss outcome`, mainFirstMiss.outcome, branchFirstMiss.outcome);
  check(`${weight}kg first miss weight`, mainFirstMiss.nextWorkingWeightKg, branchFirstMiss.nextWorkingWeightKg);
  
  // Second miss (back-off)
  const mainBackoff = mainProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state: { ...state, consecutiveFailures: 1 },
    isDeload: false,
  });
  
  const branchBackoff = branchProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: UPPER_COMPOUND,
    state: { ...state, consecutiveFailures: 1 },
    isDeload: false,
  });
  
  check(`${weight}kg backoff outcome`, mainBackoff.outcome, branchBackoff.outcome);
  check(`${weight}kg backoff weight`, mainBackoff.nextWorkingWeightKg, branchBackoff.nextWorkingWeightKg);
}

// Test isolation exercise back-off
for (const weight of [5, 10, 15, 20, 30]) {
  const state = {
    currentWorkingWeightKg: weight,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: weight,
    bestReps: 12,
    bestE1rm: weight * 1.4,
    totalSessions: 3,
  };
  
  const mainBackoff = mainProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: ISOLATION,
    state,
    isDeload: false,
  });
  
  const branchBackoff = branchProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: ISOLATION,
    state,
    isDeload: false,
  });
  
  check(`${weight}kg isolation backoff outcome`, mainBackoff.outcome, branchBackoff.outcome);
  check(`${weight}kg isolation backoff weight`, mainBackoff.nextWorkingWeightKg, branchBackoff.nextWorkingWeightKg);
}

// Test lower compound back-off
for (const weight of [20, 40, 60, 100, 150]) {
  const state = {
    currentWorkingWeightKg: weight,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: weight,
    bestReps: 12,
    bestE1rm: weight * 1.4,
    totalSessions: 3,
  };
  
  const mainBackoff = mainProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: LOWER_COMPOUND,
    state,
    isDeload: false,
  });
  
  const branchBackoff = branchProgression({
    sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: weight })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right" as const,
    meta: LOWER_COMPOUND,
    state,
    isDeload: false,
  });
  
  check(`${weight}kg lower backoff outcome`, mainBackoff.outcome, branchBackoff.outcome);
  check(`${weight}kg lower backoff weight`, mainBackoff.nextWorkingWeightKg, branchBackoff.nextWorkingWeightKg);
}

console.log(`\n--- SUMMARY ---`);
console.log(`Checked: ${checks} values`);
if (failures > 0) {
  console.log(`FAILED: ${failures} mismatches with main`);
  process.exit(1);
} else {
  console.log("ALL CHECKS PASSED - Exact equality with main for no-equipment users");
  process.exit(0);
}
