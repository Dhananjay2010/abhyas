#!/usr/bin/env tsx
/**
 * Test: Never-below-lifted invariant
 * 
 * After a 'right' or 'easy' rating, the suggested weight must never be below the weight just lifted,
 * even for off-grid weights or with equipment constraints.
 * 
 * Covers:
 * 1. 45.36 kg (100 lb) Military Press right/easy
 * 2. Off-grid weights with various equipment
 * 3. Property test sweep over off-grid weights
 */

import { evaluateProgression } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`✓ ${desc}`);
  }
}

const PRESS = {
  mechanic: "compound" as const,
  metric: "reps" as const,
  movementPattern: "vertical_press" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL = {
  mechanic: "isolation" as const,
  metric: "reps" as const,
  movementPattern: "biceps" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== Never-Below-Lifted Invariant ===\n");

// Test 1: 45.36 kg (100 lb) Military Press 'right'
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 45.36, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  check("45.36 kg 'right': next >= 45.36", d.nextWorkingWeightKg! >= 45.36, `got ${d.nextWorkingWeightKg}`);
  check("45.36 kg 'right': outcome is progressed or hold", ["progressed", "hold"].includes(d.outcome));
}

// Test 2: 45.36 kg (100 lb) Military Press 'easy'
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: PRESS,
    state: { currentWorkingWeightKg: 45.36, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  check("45.36 kg 'easy': next >= 45.36", d.nextWorkingWeightKg! >= 45.36, `got ${d.nextWorkingWeightKg}`);
  check("45.36 kg 'easy': progresses (not holds)", d.outcome === "progressed");
}

// Test 3: Off-grid dumbbell (12 kg, off 2.5 kg grid)
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 12 }, { reps: 12, weightKg: 12 }, { reps: 12, weightKg: 12 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 12, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  
  check("12 kg dumbbell 'right': next >= 12", d.nextWorkingWeightKg! >= 12, `got ${d.nextWorkingWeightKg}`);
}

// Test 4: Property test - sweep off-grid weights
{
  console.log("\nProperty test: off-grid weights never suggest below lifted");
  
  // Test 10 off-grid weights with barbell (2.5 kg grid: 0, 2.5, 5, 7.5, 10, 12.5...)
  const offGridWeights = [12.3, 18.7, 23.1, 34.6, 41.2, 52.8, 63.4, 71.9, 88.3, 97.6];
  
  for (const weight of offGridWeights) {
    const d = evaluateProgression({
      sets: [{ reps: 12, weightKg: weight }, { reps: 12, weightKg: weight }, { reps: 12, weightKg: weight }],
      plannedSets: 3,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: PRESS,
      state: { currentWorkingWeightKg: weight, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
      isDeload: false,
      equipmentIds: ["barbell"],
      unit: "kg",
    });
    
    check(`  ${weight} kg: next >= ${weight}`, d.nextWorkingWeightKg! >= weight, `got ${d.nextWorkingWeightKg}`);
  }
}

// Test 5: Off-grid weight with kettlebell
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 18.5 }, { reps: 12, weightKg: 18.5 }, { reps: 12, weightKg: 18.5 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 18.5, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  
  check("18.5 kg kettlebell: next >= 18.5", d.nextWorkingWeightKg! >= 18.5, `got ${d.nextWorkingWeightKg}, outcome: ${d.outcome}`);
}

// Test 6: Medicine ball off-grid (medicine ball: 1 kg grid, but 1 kg increment)
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 7.3 }, { reps: 12, weightKg: 7.3 }, { reps: 12, weightKg: 7.3 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 7.3, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["medicine_ball"],
    unit: "kg",
  });
  
  check("7.3 kg medicine ball: next >= 7.3", d.nextWorkingWeightKg! >= 7.3, `got ${d.nextWorkingWeightKg}`);
}

// Test 7: Edge case that requires max() - very small off-grid weight
{
  // 2.3 kg + 1.25 = 3.55, floor(3.55/2.5) = floor(1.42) = 1, 1*2.5 = 2.5
  // Without max(), would suggest 2.5 kg > 2.3 kg (OK in this case)
  // But with stored weight lower, mode could be higher
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 3.7 }, { reps: 12, weightKg: 3.7 }, { reps: 12, weightKg: 3.7 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 2.5, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("3.7 kg (off-grid): next >= 3.7", d.nextWorkingWeightKg! >= 3.7, `got ${d.nextWorkingWeightKg}`);
}

// Test 7: At max kettlebell - should hold, not drop
{
  const MAX_BELL = 48; // Largest kettlebell
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: MAX_BELL }, { reps: 12, weightKg: MAX_BELL }, { reps: 12, weightKg: MAX_BELL }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: MAX_BELL, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  
  check("48 kg kettlebell (max): outcome is hold", d.outcome === "hold", `got ${d.outcome}`);
  check("48 kg kettlebell (max): next === 48", d.nextWorkingWeightKg === MAX_BELL, `got ${d.nextWorkingWeightKg}`);
}

console.log(failures === 0 ? "\n✅ All never-below-lifted tests passed\n" : `\n❌ ${failures} test(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
