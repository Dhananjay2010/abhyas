#!/usr/bin/env tsx
/**
 * Test: Timed-hold message matches next target.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

const PLANK: ExerciseMeta = {
  mechanic: "compound",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 40, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, ...overrides };
}

function makeSet(durationSeconds: number): LoggedSet {
  return { reps: null, weightKg: null, durationSeconds };
}

function check(desc: string, pass: boolean): void {
  if (!pass) {
    console.log(`  FAIL ${desc}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok   ${desc}`);
  }
}

console.log("\n=== Timed Hold Message Consistency ===\n");

// Plank: current target 40s, hit top (40s x3) → should go to 45s
{
  const result = evaluateProgression({
    sets: [makeSet(40), makeSet(40), makeSet(40)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: 40, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check("Plank 3x40s (top of 20-40s range) → nextTargetReps is 45s", result.nextTargetReps === 45);
  check("  message says 'target goes up to 45s'", result.message.includes("45s"));
  check("  outcome is progressed", result.outcome === "progressed");
}

// Verify the message extracts the number correctly
{
  const result = evaluateProgression({
    sets: [makeSet(40), makeSet(40), makeSet(40)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: 40, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  const match = result.message.match(/(\d+)s/);
  const messageSeconds = match ? parseInt(match[1]) : null;
  
  check("Message seconds matches nextTargetReps", messageSeconds === result.nextTargetReps);
}

// T6: stored 45 + 3x40s -> not progressed (40 < 45)
{
  const result = evaluateProgression({
    sets: [makeSet(40), makeSet(40), makeSet(40)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: 45, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check("Plank stored 45 + 3x40s → not progressed (40 < 45)", result.outcome !== "progressed" && result.nextTargetReps !== 50);
}

// T6: 3x45s -> 50 (45 meets current target 45, progress to 50)
{
  const result = evaluateProgression({
    sets: [makeSet(45), makeSet(45), makeSet(45)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: 45, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check("Plank 3x45s (currentTargetReps=45) → progressed to 50s", result.outcome === "progressed" && result.nextTargetReps === 50);
}

// Weighted barbell: currentTargetReps 12, repsMax 10, 4x10 -> progressed (checks repsMax, not currentTargetReps)
{
  const SQUAT: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "squat",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };
  
  const result = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 100 },
      { reps: 10, weightKg: 100 },
      { reps: 10, weightKg: 100 },
      { reps: 10, weightKg: 100 },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 10,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: SQUAT,
    state: fresh({ currentTargetReps: 12, currentWorkingWeightKg: 100 }),
    isDeload: false,
  });
  
  check("Weighted barbell currentTargetReps=12, repsMax=10, 4x10 → progressed (weighted uses repsMax)", result.outcome === "progressed");
}

// C-2: stored target 0 behaves like null for timed hold
{
  const result = evaluateProgression({
    sets: [makeSet(40), makeSet(40), makeSet(40)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: 0, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check("C-2: stored target 0 behaves like null for timed hold (3x40s → 45s)", result.outcome === "progressed" && result.nextTargetReps === 45);
}

// C-2: stored target -5 behaves like null for timed hold
{
  const result = evaluateProgression({
    sets: [makeSet(40), makeSet(40), makeSet(40)],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PLANK,
    state: fresh({ currentTargetReps: -5, currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  check("C-2: stored target -5 behaves like null for timed hold (3x40s → 45s)", result.outcome === "progressed" && result.nextTargetReps === 45);
}

// C-2: stored target 0 behaves like null for reps exercise
{
  const PUSHUP: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: 0, currentWorkingWeightKg: 0 }),
    isDeload: false,
  });
  
  check("C-2: stored target 0 behaves like null for reps exercise (3x12 → 14 reps)", result.outcome === "progressed" && result.nextTargetReps === 14);
}

// C-2: stored target -5 behaves like null for reps exercise
{
  const PUSHUP: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
      { reps: 12, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: -5, currentWorkingWeightKg: 0 }),
    isDeload: false,
  });
  
  check("C-2: stored target -5 behaves like null for reps exercise (3x12 → 14 reps)", result.outcome === "progressed" && result.nextTargetReps === 14);
}

// Reps cap: stored 23 at plan max 12, next would be 25 but caps at 2×12=24
{
  const PUSHUP: ExerciseMeta = {
    mechanic: "compound",
    metric: "reps",
    movementPattern: "horizontal_press",
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
  };
  
  const result = evaluateProgression({
    sets: [
      { reps: 23, weightKg: 0 },
      { reps: 23, weightKg: 0 },
      { reps: 23, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: undefined,
    unit: undefined,
    meta: PUSHUP,
    state: fresh({ currentTargetReps: 23, currentWorkingWeightKg: 0 }),
    isDeload: false,
  });
  
  check("Reps cap: stored 23 (plan max 12), next would be 25 but caps at 2×12=24", result.outcome === "progressed" && result.nextTargetReps === 24);
}

console.log("\n✅ All timed-hold message tests passed\n");
