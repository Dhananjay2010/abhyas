#!/usr/bin/env tsx
/**
 * Test that success progression is capped at ONE INCREMENT (not just gridStep).
 * 
 * Kills mutants:
 * - C1: "One-step cap removed" (line 718: next = snappedFrom + Math.max(gridStep, jump))
 * - CAP-1: "cap at gridStep" (line 718: next = snappedFrom + gridStep)
 * 
 * The cap is max(gridStep, increment):
 * - Lower-body compound: increment = 5 kg, gridStep = 2.5 kg → add 5 kg
 * - Upper-body compound: increment = 2.5 kg, gridStep = 2.5 kg → add 2.5 kg  
 * - Easy doubles: lower-body easy adds 10 kg
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

const SQUAT: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "squat",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("=== One-Increment Cap (kills C1 and CAP-1) ===\n");

// Squat 40 kg right → 45 kg (increment = 5 kg)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: SQUAT,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
    units: "metric",
  });
  
  check("Squat 40 kg (right) → exactly 45 kg", result.nextWorkingWeightKg === 45, `got ${result.nextWorkingWeightKg}`);
}

// Squat 40 kg easy → 50 kg (doubled increment = 10 kg)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: SQUAT,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
    units: "metric",
  });
  
  check("Squat 40 kg (easy) → exactly 50 kg", result.nextWorkingWeightKg === 50, `got ${result.nextWorkingWeightKg}`);
}

// Bench 40 kg right → 42.5 kg (increment = 2.5 kg)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
    units: "metric",
  });
  
  check("Bench 40 kg (right) → exactly 42.5 kg", result.nextWorkingWeightKg === 42.5, `got ${result.nextWorkingWeightKg}`);
}

// Bench 40 kg easy → 45 kg (doubled increment = 5 kg)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: BENCH,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"],
    units: "metric",
  });
  
  check("Bench 40 kg (easy) → exactly 45 kg", result.nextWorkingWeightKg === 45, `got ${result.nextWorkingWeightKg}`);
}

// Dumbbell 20 kg right → 22.5 kg (increment = 2.5 kg for upper isolation)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 20, durationSeconds: null },
      { reps: 12, weightKg: 20, durationSeconds: null },
      { reps: 12, weightKg: 20, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 20,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 20,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
    units: "metric",
  });
  
  check("Dumbbell 20 kg (right) → exactly 22.5 kg", result.nextWorkingWeightKg === 22.5, `got ${result.nextWorkingWeightKg}`);
}

// Dumbbell 20 kg easy → 25 kg (isolation doesn't double, so 20 + 2.5 = 22.5, snap to 22.5)
// Actually, isolation easy DOESN'T double, so it should be 22.5
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 20, durationSeconds: null },
      { reps: 12, weightKg: 20, durationSeconds: null },
      { reps: 12, weightKg: 20, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 20,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 20,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
    units: "metric",
  });
  
  check("Dumbbell 20 kg (easy isolation) → exactly 22.5 kg", result.nextWorkingWeightKg === 22.5, `got ${result.nextWorkingWeightKg}`);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All increment cap tests passed`);
console.log("Kills C1 (line 718 of progression.ts): next = snappedFrom + jump (without Math.max)");
console.log("Kills CAP-1 (line 718): next = snappedFrom + gridStep (cap at grid, not increment)");
