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

// Test dumbbell at 12.5 kg
// Dumbbell grid is 2.5 kg, not 1.25 kg
// First miss: one step down from 12.5 = 10 kg (not 11.25)
// Two-miss floor: 90% of 12.5 = 11.25, snaps to 10 kg (compound rounding)
// Rule 2: candidate (10) is NOT < floor (10), so drops to 10
testEquipment("Dumbbell (compound, 2.5 kg steps)", ["dumbbell"], 12.5, [
  { weight: 10, counter: 1, outcome: "hold" }, // First miss: drop one step to 10, counter=1
  { weight: 10, counter: 2, outcome: "hold" }, // Second miss: 10% of 12.5 = 11.25, snaps to 10 (hold), counter=2
  { weight: 7.5, counter: 0, outcome: "backed_off" }, // Third miss: drop one step to 7.5, counter resets
]);

// Test kettlebell at 14 kg
// KB bells: 4, 6, 8, 10, 12, 14, 16, 18, 20...
// First miss: tries to go to 12, but Rule 2 (two-miss floor at 12) prevents it, holds at 14
// Second miss: same, holds at 14
// Third miss: MED-3 triggers, drops to next lower bell (12)
testEquipment("Kettlebell 14 kg", ["kettlebell"], 14, [
  { weight: 14, counter: 1, outcome: "hold" }, // First miss: Rule 2 prevents drop to 12, counter=1
  { weight: 14, counter: 2, outcome: "hold" }, // Second miss: still holds, counter=2
  { weight: 12, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops to 12, counter resets
]);

// Test kettlebell at 6 kg
// First miss: tries to go to 4, but Rule 1 (>20% cut: 33%) prevents it, holds at 6
// Second miss: same, holds at 6
// Third miss: MED-3 triggers, drops to next lower bell (4)
testEquipment("Kettlebell 6 kg", ["kettlebell"], 6, [
  { weight: 6, counter: 1, outcome: "hold" }, // First miss: Rule 1 (33% cut) prevents drop to 4, counter=1
  { weight: 6, counter: 2, outcome: "hold" }, // Second miss: still holds, counter=2
  { weight: 4, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops to 4, counter resets
]);

// Test kettlebell at 4 kg (minimum bell)
// First miss: no lower bell, holds at 4
// Second miss: still holds at 4
// Third miss: MED-3 tries to drop but no lower bell exists, holds at 4, counter increments to 3
testEquipment("Kettlebell 4 kg (minimum)", ["kettlebell"], 4, [
  { weight: 4, counter: 1, outcome: "hold" }, // First miss: smallest bell, counter=1
  { weight: 4, counter: 2, outcome: "hold" }, // Second miss: still smallest, counter=2
  { weight: 4, counter: 3, outcome: "hold" }, // Third miss: MED-3 can't drop (no lower bell), counter=3
]);

// Test pin-stack machine at 12.5 kg
// Machine_generic is pin-stack with 5 kg grid step
// First miss: one step down would be 7.5, but Rule 2 (two-miss floor at 10) prevents it, goes to 10
// Second miss: holds at 10
// Third miss: MED-3 triggers, drops one step (5 kg) to 5 kg
testEquipment("Machine (5 kg steps)", ["machine_generic"], 12.5, [
  { weight: 10, counter: 1, outcome: "hold" }, // First miss: drops to 10 (Rule 2 floor), counter=1
  { weight: 10, counter: 2, outcome: "hold" }, // Second miss: holds at 10, counter=2
  { weight: 5, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops one step (5kg) to 5, counter resets
]);

// Test medicine ball at 5 kg (1 kg grid)
// First miss: tries to drop to 4, but Rule 2 (two-miss floor at 4) prevents it, holds at 5
// Second miss: holds at 5
// Third miss: MED-3 triggers, drops one step (1 kg) to 4 kg (floor at 0)
testEquipment("Medicine ball 5 kg", ["medicine_ball"], 5, [
  { weight: 5, counter: 1, outcome: "hold" }, // First miss: Rule 2 prevents drop to 4, counter=1
  { weight: 5, counter: 2, outcome: "hold" }, // Second miss: still holds, counter=2
  { weight: 4, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops one step to 4 (floor 0), counter resets
]);

// Test resistance band at 5 kg (2.5 kg grid, bodyweight equipment with floor at 0)
// First miss: tries to drop to 2.5, but Rule 2 (two-miss floor at 4) prevents it, holds at 5
// Second miss: holds at 5
// Third miss: MED-3 triggers, drops one step (2.5 kg) to 2.5 kg (floor at 0)
testEquipment("Resistance band 5 kg", ["resistance_band"], 5, [
  { weight: 5, counter: 1, outcome: "hold" }, // First miss: Rule 2 prevents drop to 2.5, counter=1
  { weight: 5, counter: 2, outcome: "hold" }, // Second miss: still holds, counter=2
  { weight: 2.5, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops one step to 2.5 (floor 0), counter resets
]);

// Test pull-up bar (bodyweight equipment, 2.5 kg grid, floor at 0)
// First miss: tries to drop to 2.5, but Rule 2 (two-miss floor at 4) prevents it, holds at 5
// Second miss: holds at 5
// Third miss: MED-3 triggers, drops one step (2.5 kg) to 2.5 kg (floor at 0)
testEquipment("Pull-up bar", ["pull_up_bar"], 5, [
  { weight: 5, counter: 1, outcome: "hold" }, // First miss: Rule 2 prevents drop to 2.5, counter=1
  { weight: 5, counter: 2, outcome: "hold" }, // Second miss: still holds, counter=2
  { weight: 2.5, counter: 0, outcome: "backed_off" }, // Third miss: MED-3 drops one step to 2.5 (floor 0), counter resets
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
