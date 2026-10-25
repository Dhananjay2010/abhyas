#!/usr/bin/env tsx
/**
 * QA Bot 1 Must-Covers: Three critical progression scenarios
 * 
 * (7) Timed holds only progress when reaching the target
 * (2) Equipment grid: no 1.25 kg steps on pin-stack machines
 * (3) Heavier actual weight: base progression on what was actually lifted
 * 
 * All tests use the REAL progression path through evaluateProgression.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, passed: boolean, detail?: string): void {
  if (!passed) {
    console.error(`❌ FAIL: ${desc}${detail ? ` -- got ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ok   ${desc}${detail ? ` -- ${detail}` : ""}`);
  }
}

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: null,
  currentTargetReps: null,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: null,
  bestE1rm: null,
  totalSessions: 0,
  ...over,
});

const PLANK: ExerciseMeta = {
  mechanic: "isolation",
  metric: "seconds",
  movementPattern: "core",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const CALF_RAISE: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "other",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const DEADLIFT: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "hinge",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== QA Bot 1 Must-Cover (7): Timed Holds Only Progress When Reaching Target ===\n");

// Stored target is 45s. User holds 40s every session.
// Should NOT progress because 40 < 45 (resolveTarget(...).max)
{
  let state = fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 });
  
  // Session 1: 3x40s
  const s1 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 1: 3x40s with stored 45s → does NOT progress", s1.outcome !== "progressed");
  check("Session 1: target stays at 45s", s1.nextTargetReps === 45);
  
  // Update state
  state = {
    ...state,
    currentTargetReps: s1.nextTargetReps,
    consecutiveFailures: s1.consecutiveFailures,
  };
  
  // Session 2: 3x40s again
  const s2 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 2: 3x40s with stored 45s → still does NOT progress", s2.outcome !== "progressed");
  check("Session 2: target still at 45s", s2.nextTargetReps === 45);
  
  // Update state
  state = {
    ...state,
    currentTargetReps: s2.nextTargetReps,
    consecutiveFailures: s2.consecutiveFailures,
  };
  
  // Session 3: 3x40s again
  const s3 = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
      { reps: null, durationSeconds: 40, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("Session 3: 3x40s with stored 45s → STILL does NOT progress", s3.outcome !== "progressed");
  check("Session 3: target STILL at 45s (never rose)", s3.nextTargetReps === 45);
}

// Now test that 45s DOES succeed and progress
{
  const state = fresh({ currentWorkingWeightKg: null, currentTargetReps: 45 });
  
  const result = evaluateProgression({
    sets: [
      { reps: null, durationSeconds: 45, weightKg: 0 },
      { reps: null, durationSeconds: 45, weightKg: 0 },
      { reps: null, durationSeconds: 45, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 20,
    repsMax: 40,
    feel: "right",
    meta: PLANK,
    state,
    isDeload: false,
  });
  
  check("3x45s with stored 45s → DOES progress", result.outcome === "progressed");
  check("3x45s → target rises to 50s", result.nextTargetReps === 50, `${result.nextTargetReps}`);
}

console.log("\n=== QA Bot 1 Must-Cover (2): Equipment Grid - No 1.25kg Steps on Pin-Stack Machines ===\n");

// Calf raises on a pin-stack machine (e.g., standing calf raise machine)
// Pin-stack machines have 5 kg steps, not 1.25 kg
// 40 kg must go to 45 kg (NOT 41.25 kg)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CALF_RAISE,
    state: fresh({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["leg_extension"], // Pin-stack machine with 5 kg steps
    unit: "kg",
  });
  
  check("Calf raise 40 kg on pin-stack → progresses", result.outcome === "progressed");
  check("Calf raise 40 kg → 45 kg (5 kg step, NOT 41.25)", result.nextWorkingWeightKg === 45, `${result.nextWorkingWeightKg}`);
  check("Calf raise 40 kg → NOT 41.25 kg", result.nextWorkingWeightKg !== 41.25);
}

// Also test with a different pin-stack machine
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CALF_RAISE,
    state: fresh({ currentWorkingWeightKg: 40 }),
    isDeload: false,
    equipmentIds: ["seated_row_machine"], // Another pin-stack machine
    unit: "kg",
  });
  
  check("Pin-stack seated_row_machine 40 kg → 45 kg", result.nextWorkingWeightKg === 45, `${result.nextWorkingWeightKg}`);
}

console.log("\n=== QA Bot 1 Must-Cover (3): Heavier Actual Weight - Base on What Was Lifted ===\n");

// Deadlift: stored 90 kg, but user lifted 95 kg successfully
// Next weight must be based on 95 kg (what was actually lifted), not 90 kg (stored)
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 95 },
      { reps: 12, weightKg: 95 },
      { reps: 12, weightKg: 95 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: DEADLIFT,
    state: fresh({ currentWorkingWeightKg: 90 }), // Stored is 90
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("Deadlift stored 90, lifted 95 → progresses", result.outcome === "progressed");
  check("Deadlift lifted 95 → next weight >= 95", result.nextWorkingWeightKg !== null && result.nextWorkingWeightKg >= 95, `${result.nextWorkingWeightKg}`);
  check("Deadlift lifted 95 → next is 97.5 (95 + 2.5)", result.nextWorkingWeightKg === 97.5, `${result.nextWorkingWeightKg}`);
}

// Calf raise: performed 45 kg, must not suggest 43.75
{
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CALF_RAISE,
    state: fresh({ currentWorkingWeightKg: 40 }), // Stored is 40
    isDeload: false,
    equipmentIds: ["leg_extension"], // Pin-stack machine
    unit: "kg",
  });
  
  check("Calf performed 45 → progresses", result.outcome === "progressed");
  check("Calf performed 45 → next weight >= 45", result.nextWorkingWeightKg !== null && result.nextWorkingWeightKg >= 45, `${result.nextWorkingWeightKg}`);
  check("Calf performed 45 → NOT 43.75", result.nextWorkingWeightKg !== 43.75);
  check("Calf performed 45 on pin-stack → next is 50 (45 + 5)", result.nextWorkingWeightKg === 50, `${result.nextWorkingWeightKg}`);
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL QA BOT 1 MUST-COVER TESTS PASSED\n");
