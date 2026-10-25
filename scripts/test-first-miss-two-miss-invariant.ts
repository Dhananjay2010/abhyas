#!/usr/bin/env tsx
/**
 * Comprehensive first-miss >= two-miss invariant test.
 * 
 * Full grid: 0.25-150 kg in 0.25 steps, all equipment, kg and lb, compound/isolation/null mechanic.
 * Tests that first-miss result is never lighter than two-miss result.
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

const OTHER: ExerciseMeta = {
  mechanic: null,
  metric: "reps",
  movementPattern: "other",
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
    totalSessions: 0, weightAtFailureStartKg: null,
    ...overrides,
  };
}

function makeSet(reps: number, weightKg: number): LoggedSet {
  return { reps, weightKg };
}

// All equipment types requested
const equipmentSets: Array<{ids: string[], name: string}> = [
  { ids: ["barbell"], name: "barbell" },
  { ids: ["dumbbell"], name: "dumbbell" },
  { ids: ["cable_machine"], name: "cable_machine" },
  { ids: ["kettlebell"], name: "kettlebell" },
  { ids: ["medicine_ball"], name: "medicine_ball" },
  { ids: ["lat_pulldown"], name: "lat_pulldown" },
  { ids: ["leg_curl"], name: "leg_curl" },
  { ids: ["dip_belt"], name: "dip_belt" },
  { ids: ["resistance_band"], name: "resistance_band" },
  { ids: ["leg_press"], name: "leg_press" },
  { ids: ["ez_bar"], name: "ez_bar" },
  { ids: ["trap_bar"], name: "trap_bar" },
  { ids: ["weight_plate"], name: "weight_plate" },
  { ids: ["smith_machine"], name: "smith_machine" },
  { ids: ["barbell", "lat_pulldown"], name: "barbell+lat_pulldown" },
];

const units: Array<"kg" | "lb"> = ["kg", "lb"];

// Full grid: 0.25 to 150 kg in 0.25 kg steps
const testWeights: number[] = [];
for (let w = 0.25; w <= 150; w += 0.25) {
  testWeights.push(w);
}

const mechanics: Array<{meta: ExerciseMeta, name: string}> = [
  { meta: BENCH, name: "compound" },
  { meta: CURL, name: "isolation" },
  { meta: OTHER, name: "null" },
];

let totalTests = 0;

console.log("=== First-Miss >= Two-Miss Invariant: Full Grid ===");
console.log(`Testing ${equipmentSets.length} equipment sets × ${units.length} units × ${mechanics.length} mechanics × ${testWeights.length} weights`);
console.log(`Total: ${equipmentSets.length * units.length * mechanics.length * testWeights.length} tests\n`);

for (const { ids, name } of equipmentSets) {
  for (const unit of units) {
    for (const { meta, name: mechanicName } of mechanics) {
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
          console.log(`VIOLATION: ${name} ${mechanicName} ${weight} kg (${unit})`);
          console.log(`  First-miss: ${firstW} kg`);
          console.log(`  Two-miss:   ${twoW} kg`);
          console.log(`  Difference: ${twoW - firstW} kg`);
          process.exit(1);  // Exit on first violation
        }
      }
    }
  }
}

console.log(`\n✅ INVARIANT HOLDS: All ${totalTests} cases satisfy first-miss >= two-miss`);
process.exit(0);
