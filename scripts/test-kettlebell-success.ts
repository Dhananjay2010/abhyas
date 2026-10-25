#!/usr/bin/env tsx
/**
 * Test: Kettlebell success progression moves to next bell (strictly above).
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

const PRESS: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null, ...overrides };
}

function makeSet(reps: number, weightKg: number): LoggedSet {
  return { reps, weightKg };
}

function check(desc: string, pass: boolean): void {
  if (!pass) {
    console.log(`  FAIL ${desc}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok   ${desc}`);
  }
}

console.log("\n=== Kettlebell Success Progression ===\n");

// KB 16 → 18 (strictly above, next bell)
{
  const result = evaluateProgression({
    sets: [makeSet(12, 16), makeSet(12, 16), makeSet(12, 16)],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    
    meta: PRESS,
    state: fresh({ currentWorkingWeightKg: 16 }),
    isDeload: false,
  });
  
  check("KB 16 kg success → 18 kg (strictly above, next bell)", result.nextWorkingWeightKg === 18);
  check("  outcome is progressed", result.outcome === "progressed");
}

// KB 12 → 14 (strictly above)
{
  const result = evaluateProgression({
    sets: [makeSet(12, 12), makeSet(12, 12), makeSet(12, 12)],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    
    meta: PRESS,
    state: fresh({ currentWorkingWeightKg: 12 }),
    isDeload: false,
  });
  
  check("KB 12 kg success → 14 kg (strictly above)", result.nextWorkingWeightKg === 14);
  check("  outcome is progressed", result.outcome === "progressed");
}

// KB 24 → 28 (strictly above)
{
  const result = evaluateProgression({
    sets: [makeSet(12, 24), makeSet(12, 24), makeSet(12, 24)],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    
    meta: PRESS,
    state: fresh({ currentWorkingWeightKg: 24 }),
    isDeload: false,
  });
  
  check("KB 24 kg success → 28 kg (strictly above)", result.nextWorkingWeightKg === 28);
  check("  outcome is progressed", result.outcome === "progressed");
}

console.log("\n✅ All kettlebell success tests passed\n");
