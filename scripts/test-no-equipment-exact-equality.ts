#!/usr/bin/env tsx
/**
 * Test: No-equipment users get EXACTLY main's behavior
 * 
 * Sweeps 20k+ combinations of exercise parameters and verifies that
 * evaluateProgression and suggestedWeight produce identical results
 * when called with equipment_ids: [] vs with no equipment params at all.
 * 
 * This proves backward compatibility: users with no equipment info
 * get exactly the same progression as before #106.
 */

import { evaluateProgression, suggestedWeight, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs";

let cases = 0;
let failures = 0;

function check(label: string, expected: unknown, actual: unknown) {
  cases++;
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    failures++;
    console.log(`FAIL ${label}:`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

// Comprehensive sweep parameters
const mechanics: Array<"compound" | "isolation" | null> = ["compound", "isolation", null];
const patterns: Array<"horizontal_press" | "squat" | "core"> = ["horizontal_press", "squat", "core"];
const weights = [0, 2.5, 2.75, 5, 7.5, 10, 13.75, 15, 20, 30, 40, 50, 61.25];
const failureCounts = [0, 1, 2];
const repCounts = [5, 10, 12];
const feels: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const deloads = [true, false];
const units: Array<"metric" | "imperial" | null> = ["metric", "imperial", null];
const bodyweights = [true, false];

console.log("Sweeping no-equipment exact equality...\n");

for (const mechanic of mechanics) {
  for (const pattern of patterns) {
    for (const weight of weights) {
      for (const failures of failureCounts) {
        for (const reps of repCounts) {
          for (const feel of feels) {
            for (const isDeload of deloads) {
              for (const userUnits of units) {
                for (const isBodyweight of bodyweights) {
                  const meta: ExerciseMeta = {
                    mechanic: mechanic ?? null,
                    metric: "reps",
                    movementPattern: pattern,
                    isBodyweight,
                    progressionChain: null,
                    progressionRank: null,
                  };
                  
                  const state: ProgressState = {
                    currentWorkingWeightKg: weight,
                    currentTargetReps: 12,
                    consecutiveFailures: failures,
                    bestWeightKg: weight,
                    bestReps: 12,
                    bestE1rm: weight * 1.4,
                    totalSessions: 3, weightAtFailureStartKg: null,
                  };
                  
                  const sets = Array.from({ length: 4 }, () => ({ reps, weightKg: weight }));
                  
                  // Old call path: no equipment params
                  const oldResult = evaluateProgression({
                    sets,
                    plannedSets: 4,
                    repsMin: 8,
                    repsMax: 12,
                    feel: feel ?? "right",
                    meta,
                    state,
                    isDeload,
                  });
                  
                  // New call path: spread helper result for empty equipment
                  const helperInputs = progressionInputsFromExercise({ equipment_ids: [] }, userUnits);
                  const newResult = evaluateProgression({
                    sets,
                    plannedSets: 4,
                    repsMin: 8,
                    repsMax: 12,
                    feel: feel ?? "right",
                    meta,
                    state,
                    isDeload,
                    ...helperInputs,
                  });
                  
                  check(`evaluateProgression ${mechanic}/${pattern}/${weight}kg/${failures}f/${reps}r/${feel}/${isDeload}/${userUnits}/${isBodyweight}`, 
                    {
                      outcome: oldResult.outcome,
                      nextWorkingWeightKg: oldResult.nextWorkingWeightKg,
                      nextTargetReps: oldResult.nextTargetReps,
                      consecutiveFailures: oldResult.consecutiveFailures,
                      message: oldResult.message,
                    },
                    {
                      outcome: newResult.outcome,
                      nextWorkingWeightKg: newResult.nextWorkingWeightKg,
                      nextTargetReps: newResult.nextTargetReps,
                      consecutiveFailures: newResult.consecutiveFailures,
                      message: newResult.message,
                    });
                  
                  // Test suggestedWeight too
                  const oldSuggested = suggestedWeight(state, isDeload, meta);
                  const newSuggested = suggestedWeight(state, isDeload, meta, helperInputs.equipmentIds, helperInputs.unit);
                  
                  check(`suggestedWeight ${mechanic}/${pattern}/${weight}kg/${isDeload}/${userUnits}`,
                    oldSuggested,
                    newSuggested);
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Cases tested: ${cases}`);
if (failures > 0) {
  console.log(`FAILED: ${failures} differences found`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - No-equipment users get exactly main's behavior");
  process.exit(0);
}
