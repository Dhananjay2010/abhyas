#!/usr/bin/env tsx
/**
 * Multi-miss feedback test: feeds each decision's output state (weight AND counter)
 * back into the next call for at least 3 consecutive misses.
 * 
 * Tests progression across DB, KB, machine, cable, med ball, band, pull-up bar, and barbell.
 * Reproduces QA Bot 3 issue #1: third-miss step-down unreachable due to counter reset.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "@/lib/program/progression";

let failures = 0;

function testEquipment(
  name: string,
  equipmentIds: string[],
  startWeight: number,
  expectedPath: { weight: number; counter: number; outcome: string }[]
) {
  console.log(`\n=== ${name} ===`);
  console.log(`Starting at ${startWeight} kg`);

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

  for (let missNum = 1; missNum <= expectedPath.length; missNum++) {
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

    const expected = expectedPath[missNum - 1];
    const pass = 
      decision.nextWorkingWeightKg === expected.weight &&
      decision.consecutiveFailures === expected.counter &&
      decision.outcome === expected.outcome;

    if (!pass) {
      console.log(`  Miss ${missNum}: FAIL`);
      console.log(`    Expected: ${expected.weight} kg, counter=${expected.counter}, outcome=${expected.outcome}`);
      console.log(`    Got:      ${decision.nextWorkingWeightKg} kg, counter=${decision.consecutiveFailures}, outcome=${decision.outcome}`);
      failures++;
    } else {
      console.log(`  Miss ${missNum}: ${decision.nextWorkingWeightKg} kg, counter=${decision.consecutiveFailures}, outcome=${decision.outcome} ✓`);
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

// Test dumbbell stuck at 12.5 kg
testEquipment("Dumbbell (isolation, 1.25 kg steps)", ["dumbbell"], 12.5, [
  { weight: 11.25, counter: 1, outcome: "hold" }, // First miss: drop one step to 11.25, counter=1
  { weight: 11.25, counter: 2, outcome: "hold" }, // Second miss: 10% of 12.5 = 11.25, snaps to 11.25 (hold), counter=2
  { weight: 10, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 10, counter resets
]);

// Test kettlebell stuck at 14 kg
testEquipment("Kettlebell 14 kg", ["kettlebell"], 14, [
  { weight: 12, counter: 1, outcome: "hold" }, // First miss: previous bell is 12, counter=1
  { weight: 12, counter: 2, outcome: "hold" }, // Second miss: 10% of 14 = 12.6, snap to 12 (hold), counter=2
  { weight: 10, counter: 0, outcome: "backed_off" }, // Third miss: next lower bell is 10 (not 11.5), counter resets
]);

// Test kettlebell stuck at 6 kg
testEquipment("Kettlebell 6 kg", ["kettlebell"], 6, [
  { weight: 4, counter: 1, outcome: "hold" }, // First miss: previous bell is 4, counter=1
  { weight: 4, counter: 2, outcome: "hold" }, // Second miss: 10% of 6 = 5.4, snap to 4 (hold), counter=2
  { weight: 4, counter: 2, outcome: "hold" }, // Third miss: 4 kg is minimum, must hold (not 3.5 or 2.5), counter stays at 2
]);

// Test kettlebell at 4 kg (minimum)
testEquipment("Kettlebell 4 kg (minimum)", ["kettlebell"], 4, [
  { weight: 4, counter: 1, outcome: "hold" }, // First miss: already at minimum, counter=1
  { weight: 4, counter: 2, outcome: "hold" }, // Second miss: 10% can't reduce below 4, counter=2
  { weight: 4, counter: 2, outcome: "hold" }, // Third miss: must hold at 4 (not 2.5), counter stays at 2
]);

// Test machine/cable at 12.5 kg
testEquipment("Machine (2.5 kg plates)", ["machine_generic"], 12.5, [
  { weight: 10, counter: 1, outcome: "hold" }, // First miss: drop one step to 10, counter=1
  { weight: 10, counter: 2, outcome: "hold" }, // Second miss: 10% of 12.5 = 11.25, snaps to 10 (hold), counter=2
  { weight: 7.5, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 7.5, counter resets
]);

// Test medicine ball at 5 kg
testEquipment("Medicine ball 5 kg", ["medicine_ball"], 5, [
  { weight: 2.5, counter: 1, outcome: "hold" }, // First miss: drop one step to 2.5, counter=1
  { weight: 2.5, counter: 2, outcome: "hold" }, // Second miss: 10% of 5 = 4.5, snaps to 2.5 (hold), counter=2
  { weight: 0, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 0 (floor), counter resets
]);

// Test resistance band at 5 kg
testEquipment("Resistance band 5 kg", ["resistance_band"], 5, [
  { weight: 2.5, counter: 1, outcome: "hold" }, // First miss: drop one step to 2.5, counter=1
  { weight: 2.5, counter: 2, outcome: "hold" }, // Second miss: 10% of 5 = 4.5, snaps to 2.5 (hold), counter=2
  { weight: 0, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 0 (floor), counter resets
]);

// Test pull-up bar (bodyweight equipment)
testEquipment("Pull-up bar", ["pull_up_bar"], 5, [
  { weight: 2.5, counter: 1, outcome: "hold" }, // First miss: drop one step to 2.5, counter=1
  { weight: 2.5, counter: 2, outcome: "hold" }, // Second miss: 10% of 5 = 4.5, snaps to 2.5 (hold), counter=2
  { weight: 0, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 0 (floor), counter resets
]);

// Test barbell at 20 kg
testEquipment("Barbell 20 kg (2.5 kg steps)", ["barbell"], 20, [
  { weight: 17.5, counter: 1, outcome: "hold" }, // First miss: drop one step to 17.5, counter=1
  { weight: 17.5, counter: 2, outcome: "hold" }, // Second miss: 10% of 20 = 18, snaps to 17.5 (hold), counter=2
  { weight: 15, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 15, counter resets
]);

if (failures === 0) {
  console.log("\n✅ All multi-miss feedback tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
}
