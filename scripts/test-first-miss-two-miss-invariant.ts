#!/usr/bin/env tsx
/**
 * Comprehensive first-miss >= two-miss invariant test.
 * 
 * Tests that first-miss result is never lighter than two-miss result
 * across all equipment sets, kg and lb, various weights.
 * 
 * This invariant is enforced by Rule 2 in first-miss logic.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

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

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    currentWorkingWeightKg: null,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: null,
    bestE1rm: null,
    totalSessions: 0,
    ...overrides,
  };
}

function makeSet(reps: number, weightKg: number): LoggedSet {
  return { reps, weightKg };
}

const equipmentSets: Array<{ids: string[], name: string}> = [
  { ids: ["barbell"], name: "Barbell" },
  { ids: ["dumbbell"], name: "Dumbbell" },
  { ids: ["kettlebell"], name: "Kettlebell" },
  { ids: ["lat_pulldown"], name: "Pin machine" },
];

const units: Array<"kg" | "lb"> = ["kg", "lb"];

// Test weights that might trigger edge cases
const testWeights = [
  1, 2, 2.5, 2.75, 3, 4, 5, 5.5, 6, 7.5, 10, 12, 12.5, 14, 15, 16, 20, 22, 24, 
  30, 40, 60, 72.5, 100
];

const mechanics: Array<"compound" | "isolation"> = ["compound", "isolation"];

let totalTests = 0;
let violations = 0;

console.log("=== First-Miss >= Two-Miss Invariant Test ===\n");

for (const { ids, name } of equipmentSets) {
  for (const unit of units) {
    for (const mechanic of mechanics) {
      const meta = mechanic === "compound" ? BENCH : CURL;
      
      for (const weight of testWeights) {
        totalTests++;
        
        // First miss
        const firstMiss = evaluateProgression({
          sets: [makeSet(10, weight), makeSet(10, weight), makeSet(10, weight)],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          feel: "right",
          equipmentIds: ids,
          unit,
          meta,
          state: fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 0 }),
          isDeload: false,
        });
        
        // Two misses
        const twoMiss = evaluateProgression({
          sets: [makeSet(10, weight), makeSet(10, weight), makeSet(10, weight)],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          feel: "right",
          equipmentIds: ids,
          unit,
          meta,
          state: fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 1 }),
          isDeload: false,
        });
        
        const firstW = firstMiss.nextWorkingWeightKg ?? 0;
        const twoW = twoMiss.nextWorkingWeightKg ?? 0;
        
        if (firstW < twoW - 0.001) {
          violations++;
          console.log(`VIOLATION: ${name} ${mechanic} ${weight} ${unit}`);
          console.log(`  First-miss: ${firstW} kg`);
          console.log(`  Two-miss:   ${twoW} kg`);
          console.log(`  Difference: ${twoW - firstW} kg`);
        }
      }
    }
  }
}

console.log(`\nTotal tests: ${totalTests}`);
console.log(`Violations: ${violations}`);

if (violations > 0) {
  console.log(`\n❌ INVARIANT VIOLATED: ${violations} cases where first-miss < two-miss`);
  process.exit(1);
} else {
  console.log(`\n✅ INVARIANT HOLDS: All ${totalTests} cases satisfy first-miss >= two-miss`);
  process.exit(0);
}
