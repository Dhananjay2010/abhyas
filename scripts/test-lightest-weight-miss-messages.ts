#!/usr/bin/env tsx
/**
 * Test: Lightest weight (DB 2.5 kg, KB 4 kg) 3rd+ miss messages
 * 
 * At the lightest loadable weight, the 2nd miss back-off cannot reduce (would be below min),
 * so it holds. The 3rd and 4th+ misses should show accurate miss counts, not "Missed twice".
 */

import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 2.5,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 2.5,
  bestReps: 12,
  bestE1rm: null,
  totalSessions: 3,
  weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number): LoggedSet[] =>
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

console.log("\n=== Lightest weight miss messages (DB 2.5 kg) ===");

// Second miss at 2.5 kg: holds (can't go lighter)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 2.5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ consecutiveFailures: 1, weightAtFailureStartKg: 2.5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("Second miss: holds at 2.5 kg", d.nextWorkingWeightKg === 2.5);
  check("Second miss: message is 'Missed twice in a row'", 
    d.message.includes("Missed twice in a row"),
    d.message);
}

// Third miss at 2.5 kg: "Missed three times in a row"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 2.5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ consecutiveFailures: 2, weightAtFailureStartKg: 2.5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("Third miss: holds at 2.5 kg", d.nextWorkingWeightKg === 2.5);
  check("Third miss: message is 'Missed three times in a row' (not 'twice')", 
    d.message.includes("Missed three times in a row") && !d.message.includes("Missed twice"),
    d.message);
}

// Fourth miss at 2.5 kg: "Missed again"
{
  const d = evaluateProgression({
    sets: sets(4, 7, 2.5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ consecutiveFailures: 3, weightAtFailureStartKg: 2.5 }),
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("Fourth miss: holds at 2.5 kg", d.nextWorkingWeightKg === 2.5);
  check("Fourth miss: message is 'Missed again' (not 'three times' or 'twice')", 
    d.message.includes("Missed again") && !d.message.includes("three times") && !d.message.includes("Missed twice"),
    d.message);
}

console.log("\n=== Lightest weight miss messages (KB 4 kg) ===");

// KB at 4 kg, third miss
{
  const d = evaluateProgression({
    sets: sets(4, 7, 4),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 4, consecutiveFailures: 2, weightAtFailureStartKg: 4 }),
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("KB third miss: holds at 4 kg", d.nextWorkingWeightKg === 4);
  check("KB third miss: message is 'Missed three times in a row'", 
    d.message.includes("Missed three times in a row"),
    d.message);
}

// KB at 4 kg, fourth miss
{
  const d = evaluateProgression({
    sets: sets(4, 7, 4),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 4, consecutiveFailures: 3, weightAtFailureStartKg: 4 }),
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("KB fourth miss: holds at 4 kg", d.nextWorkingWeightKg === 4);
  check("KB fourth miss: message is 'Missed again'", 
    d.message.includes("Missed again"),
    d.message);
}

console.log("\n✅ All lightest-weight miss message tests passed");

console.log("\n=== Bodyweight back-off messages (counters 1, 2, 3) ===");

const PULL_UP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_pull",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

// Bodyweight counter 1 (second miss overall, backs off from 1.25 to 0)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PULL_UP,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 1, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });
  check("Bodyweight counter 1: backs off to 0 kg", d.nextWorkingWeightKg === 0);
  check("Bodyweight counter 1: 'Missed twice in a row'", 
    d.message === "Missed twice in a row — back to bodyweight to build up again.",
    d.message);
}

// Bodyweight counter 2 (third miss, still at 1.25 kg but with counter 2)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PULL_UP,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 2, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });
  check("Bodyweight counter 2: backs off to 0 kg", d.nextWorkingWeightKg === 0);
  check("Bodyweight counter 2: 'Missed three times in a row'",
    d.message === "Missed three times in a row — back to bodyweight to build up again.",
    d.message);
}

// Bodyweight counter 3 (fourth+ miss, still at 1.25 kg but with counter 3)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 1.25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PULL_UP,
    state: fresh({ currentWorkingWeightKg: 1.25, consecutiveFailures: 3, weightAtFailureStartKg: 1.25 }),
    isDeload: false,
    equipmentIds: [],
    unit: "kg",
  });
  check("Bodyweight counter 3: backs off to 0 kg", d.nextWorkingWeightKg === 0);
  check("Bodyweight counter 3: 'Missed again'",
    d.message === "Missed again — back to bodyweight to build up again.",
    d.message);
}

console.log("\n=== Barbell back-off messages (counters 1, 2, 3) ===");

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

// Barbell counter 1 (second miss)
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
  check("Barbell counter 1: backs off to 52.5 kg", d.nextWorkingWeightKg === 52.5);
  check("Barbell counter 1: 'Missed twice in a row — dropping to 52.5 kg'",
    d.message === "Missed twice in a row — dropping to 52.5 kg to build back.",
    d.message);
}

// Barbell counter 2 (third miss, still backs off from wafs 60)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 2, weightAtFailureStartKg: 60 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("Barbell counter 2: backs off to 52.5 kg", d.nextWorkingWeightKg === 52.5);
  check("Barbell counter 2: 'Missed three times in a row — dropping to 52.5 kg'",
    d.message === "Missed three times in a row — dropping to 52.5 kg to build back.",
    d.message);
}

// Barbell counter 3 (fourth+ miss, still backs off from wafs 60)
{
  const d = evaluateProgression({
    sets: sets(4, 7, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 3, weightAtFailureStartKg: 60 }),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("Barbell counter 3: backs off to 52.5 kg", d.nextWorkingWeightKg === 52.5);
  check("Barbell counter 3: 'Missed again — dropping to 52.5 kg'",
    d.message === "Missed again — dropping to 52.5 kg to build back.",
    d.message);
}

console.log("\n✅ All lightest-weight and back-off miss message tests passed");
