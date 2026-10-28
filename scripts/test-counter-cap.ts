#!/usr/bin/env tsx
/**
 * Test that consecutiveFailures caps at 3 when third-miss can't reduce weight.
 * Prevents infinite counter growth at minimum weights.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "@/lib/program/progression";

let failures = 0;

function testCounterCap(
  name: string,
  equipmentIds: string[],
  startWeight: number
) {
  console.log(`\n=== ${name} ===`);
  
  const meta: ExerciseMeta = {
    mechanic: "compound",
    movementPattern: "horizontal_press",
    metric: "reps",
    isBodyweight: false,
    progressionChain: null,
    progressionRank: null,
  };

  let state: ProgressState = {
    currentWorkingWeightKg: startWeight,
    currentTargetReps: 10,
    consecutiveFailures: 0,
    bestWeightKg: startWeight,
    bestReps: 10,
    bestE1rm: null,
    totalSessions: 1,
    weightAtFailureStartKg: null,
  };

  const missingSets = [
    { reps: 5, weightKg: startWeight },
    { reps: 4, weightKg: startWeight },
    { reps: 3, weightKg: startWeight },
  ];

  for (let missNum = 1; missNum <= 5; missNum++) {
    const decision = evaluateProgression({
      sets: missingSets.map(s => ({ ...s, weightKg: state.currentWorkingWeightKg })),
      plannedSets: 3,
      repsMin: 8,
      repsMax: 12,
      feel: null,
      meta,
      state,
      isDeload: false,
      equipmentIds,
    });

    console.log(`  Miss ${missNum}: ${decision.nextWorkingWeightKg} kg, counter=${decision.consecutiveFailures}, outcome=${decision.outcome}`);

    // After miss 3, counter should cap at 3 (not grow to 4, 5, ...)
    if (missNum >= 3 && decision.consecutiveFailures !== 3) {
      console.log(`  ❌ FAIL: Expected counter=3 after miss ${missNum}, got ${decision.consecutiveFailures}`);
      failures++;
    }

    state = {
      ...state,
      currentWorkingWeightKg: decision.nextWorkingWeightKg,
      consecutiveFailures: decision.consecutiveFailures,
      weightAtFailureStartKg: decision.weightAtFailureStartKg,
    };
  }
}

// Test KB at 4 kg (minimum bell)
testCounterCap("Kettlebell 4 kg (minimum bell)", ["kettlebell"], 4);

// Test standard equipment at minimum grid weight (2.5 kg)
testCounterCap("Dumbbell 2.5 kg (minimum grid)", ["dumbbell"], 2.5);

if (failures === 0) {
  console.log("\n✅ Counter cap test passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
