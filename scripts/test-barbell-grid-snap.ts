/**
 * Reproduce QA bug: barbell calf raise showing "up to 41.25 kg"
 * 
 * At 02ce6f5b, when equipmentIds is NOT passed to evaluateProgression,
 * barbell isolation (calf raise) at 40 kg with success produces 41.25 kg.
 * 
 * This happens in the success path where incrementFor is called without equipmentIds.
 * The fix adds equipmentIds parameter to incrementFor which checks hasLoadable
 * and returns max(mechanicIncrement, equipmentGrid) for loadable equipment.
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

const BARBELL_CALF: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "calf",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Test 1: With equipmentIds (production always passes this)");
const decisionWith = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
  ],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BARBELL_CALF,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["barbell"],
});

console.log("  Next weight:", decisionWith.nextWorkingWeightKg, "kg");
console.log("  Message:", decisionWith.message);
console.log();

console.log("Test 2: Without equipmentIds (bug path - fallback case)");
const decisionWithout = evaluateProgression({
  sets: [
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
    { reps: 12, weightKg: 40, durationSeconds: null },
  ],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: BARBELL_CALF,
  state: {
    currentWorkingWeightKg: 40,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 40,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  // equipmentIds NOT passed - fallback path
});

console.log("  Next weight:", decisionWithout.nextWorkingWeightKg, "kg");
console.log("  Message:", decisionWithout.message);
console.log();

let failures = 0;
if (decisionWith.nextWorkingWeightKg !== 42.5) {
  console.log(`❌ FAIL: With equipmentIds should be 42.5, got ${decisionWith.nextWorkingWeightKg}`);
  failures++;
} else {
  console.log(`✅ With equipmentIds: 42.5 kg (correct)`);
}

if (decisionWithout.nextWorkingWeightKg !== 42.5) {
  console.log(`❌ FAIL: Without equipmentIds should be 42.5, got ${decisionWithout.nextWorkingWeightKg}`);
  failures++;
} else {
  console.log(`✅ Without equipmentIds: 42.5 kg (defensive fix works)`);
}

process.exit(failures > 0 ? 1 : 0);
