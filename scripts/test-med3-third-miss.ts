#!/usr/bin/env tsx
/**
 * Test: MED-3 third-miss step-down for stuck loads
 * 
 * When 0.9x back-off snaps to current weight (no change), the third consecutive
 * miss drops one grid step, floored at the equipment's smallest load.
 * 
 * Tests:
 * - Dumbbell isolation 12.5 kg: 3rd miss drops one step (2.5 kg)
 * - KB 4 kg: stays at floor
 * - Leg extension 35 kg: drops one machine step (5 kg)
 * - Cable 12.5 kg: drops one step (2.5 kg)
 * - Bodyweight: floors at 0
 * - 2nd miss is unchanged for all
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const LEG_EXT: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "other",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const KB_SWING: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "hinge",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const missingSets = Array.from({ length: 4 }, (_, i) => ({ reps: 7, weightKg: 0 }));

console.log("MED-3: Third-miss step-down for stuck loads\n");

console.log("1. Dumbbell isolation 12.5 kg");
{
  // Setup: first miss was at 15 kg, dropped to 12.5 kg
  // Second miss at 12.5 kg: 0.9 * 15 (pre-miss) = 13.5, snap DOWN = 12.5 = current → HOLDS
  const secondMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 12.5 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 12.5,
      currentTargetReps: 12,
      consecutiveFailures: 1,
      bestWeightKg: 15,
      bestReps: 12,
      bestE1rm: 21,
      totalSessions: 5,
      weightAtFailureStartKg: 15, // Pre-miss weight stored on 1st miss
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
  });

  check("Dumbbell 2nd miss: holds at 12.5 kg", secondMiss.nextWorkingWeightKg === 12.5, `got ${secondMiss.nextWorkingWeightKg}`);
  check("Dumbbell 2nd miss: outcome hold (weight clamped to current)", secondMiss.outcome === "hold");

  // Third miss at 12.5 kg: 0.9 * 15 = 13.5, snap DOWN = 12.5 = current
  // MED-3 triggers: drop one step = 12.5 - 2.5 = 10 kg
  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 12.5 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 12.5,
      currentTargetReps: 12,
      consecutiveFailures: 2, // Third miss
      bestWeightKg: 15,
      bestReps: 12,
      bestE1rm: 21,
      totalSessions: 5,
      weightAtFailureStartKg: 15, // Pre-miss weight (from first miss)
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
  });

  check("Dumbbell 3rd miss: drops one step to 10 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 10, `got ${thirdMiss.nextWorkingWeightKg}`);
  check("Dumbbell 3rd miss: outcome backed_off", thirdMiss.outcome === "backed_off");
  check("Dumbbell 3rd miss: message mentions 'three times'", thirdMiss.message.includes("three times"));
}

console.log("\n2. Kettlebell 4 kg (at floor)");
{
  const secondMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 4 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: KB_SWING,
    state: {
      currentWorkingWeightKg: 4,
      currentTargetReps: 12,
      consecutiveFailures: 1,
      bestWeightKg: 6,
      bestReps: 12,
      bestE1rm: 8.4,
      totalSessions: 5,
      weightAtFailureStartKg: 6,
    },
    isDeload: false,
    equipmentIds: ["kettlebell"],
  });

  check("KB 4 kg 2nd miss: stays at 4 kg (floor)", secondMiss.nextWorkingWeightKg === 4 || secondMiss.outcome === "hold", `got ${secondMiss.nextWorkingWeightKg}, ${secondMiss.outcome}`);

  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 4 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: KB_SWING,
    state: {
      currentWorkingWeightKg: 4,
      currentTargetReps: 12,
      consecutiveFailures: 2,
      bestWeightKg: 6,
      bestReps: 12,
      bestE1rm: 8.4,
      totalSessions: 5,
      weightAtFailureStartKg: 6,
    },
    isDeload: false,
    equipmentIds: ["kettlebell"],
  });

  check("KB 4 kg 3rd miss: stays at 4 kg floor (MED-3 floors at min bell)", thirdMiss.nextWorkingWeightKg === 4, `got ${thirdMiss.nextWorkingWeightKg}`);
}

console.log("\n3. Leg extension 35 kg (machine)");
{
  // Machine grid is 5 kg
  // Pre-miss 40 kg, 2nd miss at 35 kg: 0.9 * 40 = 36, snap DOWN = 35 = current → HOLDS
  const secondMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 35 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: LEG_EXT,
    state: {
      currentWorkingWeightKg: 35,
      currentTargetReps: 12,
      consecutiveFailures: 1,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 5,
      weightAtFailureStartKg: 40,
    },
    isDeload: false,
    equipmentIds: ["leg_extension"],
  });

  check("Leg ext 2nd miss: holds at 35 kg", secondMiss.nextWorkingWeightKg === 35, `got ${secondMiss.nextWorkingWeightKg}`);
  
  // Third miss: MED-3 drops one machine step to 30 kg
  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 35 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: LEG_EXT,
    state: {
      currentWorkingWeightKg: 35,
      currentTargetReps: 12,
      consecutiveFailures: 2,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 5,
      weightAtFailureStartKg: 40,
    },
    isDeload: false,
    equipmentIds: ["leg_extension"],
  });

  check("Leg ext 3rd miss: drops one machine step to 30 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 30, `got ${thirdMiss.nextWorkingWeightKg}`);
}

console.log("\n4. Cable 12.5 kg");
{
  // Pre-miss 15 kg, 2nd miss at 12.5: 0.9 * 15 = 13.5, snap DOWN = 12.5 = current → HOLDS
  const secondMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 12.5 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 12.5,
      currentTargetReps: 12,
      consecutiveFailures: 1,
      bestWeightKg: 15,
      bestReps: 12,
      bestE1rm: 21,
      totalSessions: 5,
      weightAtFailureStartKg: 15,
    },
    isDeload: false,
    equipmentIds: ["cable_machine"],
  });

  check("Cable 2nd miss: holds at 12.5 kg", secondMiss.nextWorkingWeightKg === 12.5, `got ${secondMiss.nextWorkingWeightKg}`);
  
  // Third miss: MED-3 drops one step to 10 kg
  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 12.5 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 12.5,
      currentTargetReps: 12,
      consecutiveFailures: 2,
      bestWeightKg: 15,
      bestReps: 12,
      bestE1rm: 21,
      totalSessions: 5,
      weightAtFailureStartKg: 15,
    },
    isDeload: false,
    equipmentIds: ["cable_machine"],
  });

  check("Cable 3rd miss: drops one step to 10 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 10, `got ${thirdMiss.nextWorkingWeightKg}`);
}

console.log("\n5. Bodyweight floors at 0");
{
  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 1.25 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PUSHUP,
    state: {
      currentWorkingWeightKg: 1.25,
      currentTargetReps: 12,
      consecutiveFailures: 2,
      bestWeightKg: 2.5,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 5,
      weightAtFailureStartKg: 2.5,
    },
    isDeload: false,
    equipmentIds: [],
  });

  check("Bodyweight 1.25 kg 3rd miss: drops to 0 kg floor (MED-3)", thirdMiss.nextWorkingWeightKg === 0, `got ${thirdMiss.nextWorkingWeightKg}`);
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - MED-3 third-miss step-down works");
  process.exit(0);
}
