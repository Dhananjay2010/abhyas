#!/usr/bin/env tsx
/**
 * Reproduces QA Bot 3 HIGH issue #1: third-miss step-down unreachable.
 * 
 * Tests realistic scenarios where:
 * 1. First miss drops one step
 * 2. Second miss 10% reduction results in a hold (no lighter weight within 10%)
 * 3. Third miss should drop one more step to break through
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "@/lib/program/progression";

let failures = 0;

function testStuckWeight(
  name: string,
  equipmentIds: string[],
  startWeight: number,
  expectedMiss3Weight: number
) {
  console.log(`\n=== ${name}: ${startWeight} kg ===`);

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

  const missingSets: LoggedSet[] = [
    { reps: 5, weightKg: startWeight },
    { reps: 4, weightKg: startWeight },
    { reps: 3, weightKg: startWeight },
  ];

  // Run 3 consecutive misses
  for (let missNum = 1; missNum <= 3; missNum++) {
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

    if (missNum === 3) {
      if (decision.nextWorkingWeightKg !== expectedMiss3Weight) {
        console.log(`    ❌ FAIL: Expected ${expectedMiss3Weight} kg, got ${decision.nextWorkingWeightKg} kg`);
        failures++;
      } else {
        console.log(`    ✓ PASS`);
      }
    }

    // Feed back the output state
    state = {
      ...state,
      currentWorkingWeightKg: decision.nextWorkingWeightKg,
      consecutiveFailures: decision.consecutiveFailures,
      weightAtFailureStartKg: decision.weightAtFailureStartKg,
    };
  }
}

// Realistic scenarios where third-miss should trigger

// Barbell 20 kg: first miss drops to 17.5, second miss 10% of 20 = 18 snaps to 17.5 (hold), third miss should drop to 15
testStuckWeight("Barbell", ["barbell"], 20, 15);

// Machine 12.5 kg: first miss to 10, second miss holds at 10, third miss to 5 (5 kg pin-stack steps)
testStuckWeight("Machine", ["machine_generic"], 12.5, 5);

// Kettlebell 14 kg: first miss holds at 14 (Rule 2), second miss holds at 14, third miss to 12
testStuckWeight("Kettlebell", ["kettlebell"], 14, 12);

// Kettlebell 6 kg: first miss to 4, second miss 10% of 6 = 5.4 snaps to 4 (hold), third miss holds at 4 (minimum)
testStuckWeight("Kettlebell", ["kettlebell"], 6, 4);

if (failures === 0) {
  console.log("\n✅ All third-miss tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
