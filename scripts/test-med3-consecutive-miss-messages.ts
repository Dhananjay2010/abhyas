#!/usr/bin/env tsx
/**
 * Test MED-3 consecutive miss messages with equipment (2nd, 3rd, 4th+ misses).
 * Verifies both the step-down weight and exact message copy.
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number | null): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

function check(description: string, condition: boolean, actual?: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${description}`);
    if (actual) {
      console.error(`       Got: ${actual}`);
    }
    process.exit(1);
  }
  console.log(`  ok   ${description}`);
}

console.log("\n=== MED-3: Consecutive Miss Messages (with equipment) ===");

// Second miss at 60 kg: normal back-off to 52.5 kg
{
  const d = evaluateProgression({
    sets: sets(4, 7, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 1, weightAtFailureStartKg: 60 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("Second miss at 60 kg: weight drops to 52.5 kg", d.nextWorkingWeightKg === 52.5);
  check("Second miss: message is 'Missed twice in a row'", 
    d.message === "Missed twice in a row — dropping to 52.5 kg to build back.",
    d.message);
}

// Third miss at 5 kg: MED-3 one-step-down (2nd miss would hold at 5)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 2, weightAtFailureStartKg: 5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"], // 2.5 kg grid; a barbell would hold at the 20 kg bar
    unit: "kg",
  });
  check("Third miss at 5 kg: weight drops one step to 2.5 kg (MED-3)", d.nextWorkingWeightKg === 2.5);
  check("Third miss: message is 'Missed three times in a row'", 
    d.message === "Missed three times in a row — dropping one step to 2.5 kg to break through.",
    d.message);
}

// Fourth miss at 5 kg: still MED-3, but "Missed again"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 3, weightAtFailureStartKg: 5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"], // 2.5 kg grid; a barbell would hold at the 20 kg bar
    unit: "kg",
  });
  check("Fourth miss at 5 kg: weight drops one step to 2.5 kg", d.nextWorkingWeightKg === 2.5);
  check("Fourth miss: message is 'Missed again' (not 'three')", 
    d.message === "Missed again — dropping one step to 2.5 kg to break through.",
    d.message);
}

// Fifth miss at 5 kg: still "Missed again"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 4, weightAtFailureStartKg: 5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"], // 2.5 kg grid; a barbell would hold at the 20 kg bar
    unit: "kg",
  });
  check("Fifth miss at 5 kg: weight drops one step to 2.5 kg", d.nextWorkingWeightKg === 2.5);
  check("Fifth miss: message is 'Missed again'", 
    d.message === "Missed again — dropping one step to 2.5 kg to break through.",
    d.message);
}

console.log("\n=== Resistance band: drop to no band ===");

// Third miss with resistance_band at 1.25 kg: MED-3 drops to 0
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 2, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: ["resistance_band"],
    unit: "kg",
  });
  check("Third miss resistance_band 1.25 kg: weight drops to 0 kg", d.nextWorkingWeightKg === 0);
  check("Third miss resistance_band: exact message 'Missed three times in a row — dropping to no band'", 
    d.message === "Missed three times in a row — dropping to no band to build up again.",
    d.message);
}

// Fourth miss with resistance_band at 1.25 kg: "Missed again"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 3, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: ["resistance_band"],
    unit: "kg",
  });
  check("Fourth miss resistance_band 1.25 kg: weight drops to 0 kg", d.nextWorkingWeightKg === 0);
  check("Fourth miss resistance_band: exact message 'Missed again — dropping to no band'", 
    d.message === "Missed again — dropping to no band to build up again.",
    d.message);
}

console.log("\n=== Pull-up bar: drop to bodyweight ===");

// Third miss with pull_up_bar at 1.25 kg: MED-3 drops to 0
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 2, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: ["pull_up_bar"],
    unit: "kg",
  });
  check("Third miss pull_up_bar 1.25 kg: weight drops to 0 kg", d.nextWorkingWeightKg === 0);
  check("Third miss pull_up_bar: exact message 'Missed three times in a row — dropping to bodyweight'", 
    d.message === "Missed three times in a row — dropping to bodyweight to build up again.",
    d.message);
}

// Fourth miss with pull_up_bar at 1.25 kg: "Missed again"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 3, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: ["pull_up_bar"],
    unit: "kg",
  });
  check("Fourth miss pull_up_bar 1.25 kg: weight drops to 0 kg", d.nextWorkingWeightKg === 0);
  check("Fourth miss pull_up_bar: exact message 'Missed again — dropping to bodyweight'", 
    d.message === "Missed again — dropping to bodyweight to build up again.",
    d.message);
}

console.log("\n✅ All MED-3 consecutive miss message tests passed");
