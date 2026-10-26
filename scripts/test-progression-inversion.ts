#!/usr/bin/env tsx
/**
 * Test: Progression inversion property
 * 
 * Asserts that a better session (more reps at the same weights) never ends with
 * a LOWER next weight than a worse one.
 * 
 * Grid: stored null/0/20/40, set-weight patterns (at/above/below stored),
 * rep patterns (miss/in-range/top), feels (easy/right/hard)
 * 
 * Run: npm run test:progression-inversion
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type Feel,
} from "../src/lib/program/progression";

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const state = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 10,
  bestE1rm: 53.33,
  totalSessions: 1,
  ...over,
});

type RepPattern = "miss" | "in-range" | "top";

function getReps(pattern: RepPattern, repsMin: number, repsMax: number): number {
  if (pattern === "miss") return repsMin - 1;
  if (pattern === "in-range") return Math.floor((repsMin + repsMax) / 2);
  return repsMax;
}

console.log("\nProgression Inversion Property Test");
console.log("────────────────────────────────────────────────────────────\n");

let inversionCount = 0;
let totalComparisons = 0;

const storedWeights = [null, 0, 20, 40];
const setWeights = [20, 40, 45, 60]; // below, at, above stored
const repPatterns: RepPattern[] = ["miss", "in-range", "top"];
const feels: Feel[] = ["easy", "right", "hard"];
const repsMin = 8;
const repsMax = 12;

// Test: for each configuration, a session with MORE reps should never give LOWER next weight
for (const stored of storedWeights) {
  for (const weight of setWeights) {
    for (const feel of feels) {
      // Test all rep pattern pairs where pattern1 has fewer reps than pattern2
      for (let i = 0; i < repPatterns.length; i++) {
        for (let j = i + 1; j < repPatterns.length; j++) {
          const pattern1 = repPatterns[i];
          const pattern2 = repPatterns[j];
          
          const reps1 = getReps(pattern1, repsMin, repsMax);
          const reps2 = getReps(pattern2, repsMin, repsMax);
          
          // pattern2 should have more reps (better session)
          if (reps2 <= reps1) continue;
          
          const decision1 = evaluateProgression({
            sets: [
              { reps: reps1, weightKg: weight },
              { reps: reps1, weightKg: weight },
              { reps: reps1, weightKg: weight },
              { reps: reps1, weightKg: weight },
            ],
            plannedSets: 4,
            repsMin,
            repsMax,
            feel,
            meta: BENCH,
            state: state({ currentWorkingWeightKg: stored }),
            isDeload: false,
            equipmentIds: ["barbell"],
            unit: "kg",
          });
          
          const decision2 = evaluateProgression({
            sets: [
              { reps: reps2, weightKg: weight },
              { reps: reps2, weightKg: weight },
              { reps: reps2, weightKg: weight },
              { reps: reps2, weightKg: weight },
            ],
            plannedSets: 4,
            repsMin,
            repsMax,
            feel,
            meta: BENCH,
            state: state({ currentWorkingWeightKg: stored }),
            isDeload: false,
            equipmentIds: ["barbell"],
            unit: "kg",
          });
          
          totalComparisons++;
          
          const next1 = decision1.nextWorkingWeightKg ?? 0;
          const next2 = decision2.nextWorkingWeightKg ?? 0;
          
          // Inversion: better session (more reps) gives LOWER next weight
          if (next2 < next1) {
            inversionCount++;
            console.log(`❌ INVERSION: stored=${stored}, weight=${weight}, feel=${feel}`);
            console.log(`   ${pattern1} (${reps1} reps) → next=${next1} kg`);
            console.log(`   ${pattern2} (${reps2} reps) → next=${next2} kg (WORSE!)`);
            console.log(`   outcomes: ${decision1.outcome} vs ${decision2.outcome}`);
            console.log();
          }
        }
      }
    }
  }
}

console.log("────────────────────────────────────────────────────────────");
console.log(`Total comparisons: ${totalComparisons}`);
console.log(`Inversions found: ${inversionCount}`);
console.log();

if (inversionCount === 0) {
  console.log("✅ PASSED: No inversions detected\n");
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${inversionCount} inversion(s) detected\n`);
  process.exit(1);
}
