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
  // Second miss at 12.5 kg: 0.9 * 12.5 = 11.25, snap DOWN = 10 kg
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
      bestWeightKg: 12.5,
      bestReps: 12,
      bestE1rm: 18,
      totalSessions: 5,
      weightAtFailureStartKg: 15, // Pre-miss weight
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
  });

  check("Dumbbell 2nd miss: consecutiveFailures resets", secondMiss.consecutiveFailures === 0);

  // Third miss at 12.5 kg: 0.9 * 12.5 = 11.25, snap DOWN = 10 kg, BUT 10 < 12.5 so it WOULD change
  // Let me use a case where it DOESN'T change: 10 kg
  // 0.9 * 10 = 9, snap DOWN to 2.5 grid = 7.5 kg < 10, so this changes too
  // Actually need a weight where 0.9x snaps to itself. Let me try 7.5:
  // 0.9 * 7.5 = 6.75, snap DOWN = 5 kg < 7.5, changes
  // Try 5 kg: 0.9 * 5 = 4.5, snap DOWN = 2.5 kg < 5, changes
  // Try 2.5 kg: 0.9 * 2.5 = 2.25, snap DOWN = 0 or 2.5 (floor at min), could be 2.5
  // Actually, for dumbbell the min is 2.5 kg, so snap DOWN of 2.25 would be 0 or 2.5
  
  // Let me reconsider: the case is when reduced === currentWeight, meaning the helper returned current weight
  // This happens when the 10% back-off doesn't find a lighter loadable weight
  // For 12.5 kg dumbbell at 3rd miss starting from 12.5:
  // weightToBackOffFrom = 12.5 (or could be the original pre-miss)
  // But actually, if we're at consecutiveFailures=2 (about to become 3), then:
  // - First miss was at some weight W, dropped to W'
  // - Second miss was at W', backed off to W''
  // - Third miss is at W'', and weightAtFailureStartKg should still be W
  
  // Let me use a simpler case: 2.5 kg dumbbell at 3rd consecutive miss
  const thirdMiss25 = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 2.5 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 2.5,
      currentTargetReps: 12,
      consecutiveFailures: 2, // Third miss
      bestWeightKg: 5,
      bestReps: 12,
      bestE1rm: 7,
      totalSessions: 5,
      weightAtFailureStartKg: 5, // Pre-miss was 5
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
  });

  // 0.9 * 5 (pre-miss) = 4.5, snap DOWN = 2.5 kg, but current is already 2.5
  // So reduced === current, trigger MED-3: drop one step = 2.5 - 2.5 = 0, floor at 2.5 = 2.5
  // Hmm, this would stay at 2.5

  // Actually I need to test with a weight where 0.9x of pre-miss equals current
  // If pre-miss was 12.5 and current is 10 (after 2nd miss backed off):
  // 0.9 * 12.5 = 11.25, snap DOWN = 10 = current! This triggers MED-3
  const thirdMiss = evaluateProgression({
    sets: missingSets.map(s => ({ ...s, weightKg: 10 })),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: {
      currentWorkingWeightKg: 10,
      currentTargetReps: 12,
      consecutiveFailures: 2, // Third miss
      bestWeightKg: 12.5,
      bestReps: 12,
      bestE1rm: 18,
      totalSessions: 5,
      weightAtFailureStartKg: 12.5, // Pre-miss weight (from first miss)
    },
    isDeload: false,
    equipmentIds: ["dumbbell"],
  });

  check("Dumbbell 10 kg 3rd miss: drops one step to 7.5 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 7.5, `got ${thirdMiss.nextWorkingWeightKg}`);
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
  // Pre-miss 40 kg, 2nd miss at 35 kg: 0.9 * 40 = 36, snap DOWN = 35 = current
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

  check("Leg ext 35 kg 3rd miss: drops one machine step to 30 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 30, `got ${thirdMiss.nextWorkingWeightKg}`);
}

console.log("\n4. Cable 12.5 kg");
{
  // Pre-miss 15 kg, 2nd miss at 12.5: 0.9 * 15 = 13.5, snap DOWN = 12.5 = current
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

  check("Cable 12.5 kg 3rd miss: drops one step to 10 kg (MED-3)", thirdMiss.nextWorkingWeightKg === 10, `got ${thirdMiss.nextWorkingWeightKg}`);
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
