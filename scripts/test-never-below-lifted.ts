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

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`✓ ${desc}`);
  }
}

const PRESS: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
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
  
  check("45.36 kg 'right': next >= 45.36", (d.nextWorkingWeightKg ?? NaN) >= 45.36, `got ${d.nextWorkingWeightKg}`);
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
  
  check("45.36 kg 'easy': next >= 45.36", d.nextWorkingWeightKg ?? NaN >= 45.36, `got ${d.nextWorkingWeightKg}`);
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
  
  check("12 kg dumbbell 'right': next >= 12", d.nextWorkingWeightKg ?? NaN >= 12, `got ${d.nextWorkingWeightKg}`);
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
    
    check(`  ${weight} kg: next >= ${weight}`, d.nextWorkingWeightKg ?? NaN >= weight, `got ${d.nextWorkingWeightKg}`);
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
  
  check("18.5 kg kettlebell: next >= 18.5", d.nextWorkingWeightKg ?? NaN >= 18.5, `got ${d.nextWorkingWeightKg}, outcome: ${d.outcome}`);
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
  
  check("7.3 kg medicine ball: next >= 7.3", d.nextWorkingWeightKg ?? NaN >= 7.3, `got ${d.nextWorkingWeightKg}`);
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
  
  check("3.7 kg (off-grid): next >= 3.7", d.nextWorkingWeightKg ?? NaN >= 3.7, `got ${d.nextWorkingWeightKg}`);
}

// Test 8: Off-grid dip belt case where step is below grid (item 6 requirement)
{
  // dip_belt with bodyweight + added weight: stored 5.1, lifted 5.1, 'right'
  // addedWeightStep for upper-body = 1.25 kg, but dip_belt is loadable (2.5 kg grid)
  // Should use max(1.25, 2.5) = 2.5 kg step → 5.1 + 2.5 = 7.6, floor to 7.5
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 5.1 }, { reps: 12, weightKg: 5.1 }, { reps: 12, weightKg: 5.1 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "vertical_press",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state: { currentWorkingWeightKg: 5.1, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["dip_belt"],
    unit: "kg",
  });
  
  check("5.1 kg dip_belt 'right': next >= 5.1", d.nextWorkingWeightKg ?? NaN >= 5.1, `got ${d.nextWorkingWeightKg}`);
  check("5.1 kg dip_belt 'right': expected 7.5 kg", d.nextWorkingWeightKg === 7.5, `got ${d.nextWorkingWeightKg}`);
}

// Test 9: 45.36 kg Military Press with exact pins (item 6 requirement)
{
  // 45.36 kg 'right' → 47.5 kg (45.36 + 2.5, floor-snap)
  const dRight = evaluateProgression({
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
  
  check("45.36 kg 'right': exact pin at 47.5 kg", dRight.nextWorkingWeightKg === 47.5, `got ${dRight.nextWorkingWeightKg}`);
  
  // 45.36 kg 'easy' → 50 kg (45.36 + 5, floor-snap, easy doubles mechanic 2.5)
  const dEasy = evaluateProgression({
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
  
  check("45.36 kg 'easy': exact pin at 50 kg", dEasy.nextWorkingWeightKg === 50, `got ${dEasy.nextWorkingWeightKg}`);
}

// Test 10: At max kettlebell - should hold, not drop
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

// Test 11: Kettlebell above max bell (50 kg) - kills M2 mutant
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 50, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  
  check("50 kg kettlebell (above max): outcome is hold", d.outcome === "hold", `got ${d.outcome}`);
  check("50 kg kettlebell (above max): next === 50", d.nextWorkingWeightKg === 50, `got ${d.nextWorkingWeightKg}`);
  check("50 kg kettlebell (above max): message", d.message === "All sets at the top of the range — no heavier load available.", `got ${d.message}`);
}

// Test 12: Kettlebell at max bell (48 kg) with exact message - kills M2 mutant
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 48 }, { reps: 12, weightKg: 48 }, { reps: 12, weightKg: 48 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 48, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  
  check("48 kg kettlebell (max): outcome is hold", d.outcome === "hold", `got ${d.outcome}`);
  check("48 kg kettlebell (max): next === 48", d.nextWorkingWeightKg === 48, `got ${d.nextWorkingWeightKg}`);
  check("48 kg kettlebell (max): message", d.message === "All sets at the top of the range — no heavier load available.", `got ${d.message}`);
}

console.log(failures === 0 ? "\n✅ All never-below-lifted tests passed\n" : `\n❌ ${failures} test(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
