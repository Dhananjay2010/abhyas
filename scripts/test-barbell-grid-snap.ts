/**
 * Reproduce QA bug: barbell calf raise showing "up to 41.25 kg"
 * 
 * At 02ce6f5b, when equipmentIds is NOT passed to evaluateProgression,
 * barbell isolation (calf raise) at 40 kg with success produces 41.25 kg.
 * 
 * The fix ensures equipmentIds is ALWAYS passed from the session runner.
 * This test verifies that WITH equipmentIds, the result snaps to barbell grid (2.5 kg).
 * 
 * Note: The test without equipmentIds now correctly returns 41.25 kg because
 * without equipment information, incrementFor uses the mechanic-based 1.25 kg.
 * The real-world fix is ensuring the session runner always passes equipmentIds.
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

console.log("Test: Barbell calf raise at 40 kg, all sets 12 reps");
const decision = evaluateProgression({
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
  equipmentIds: ["barbell"], // With equipmentIds, must snap to 2.5 kg grid
});

console.log("  Next weight:", decision.nextWorkingWeightKg, "kg");
console.log("  Message:", decision.message);
console.log();

if (decision.nextWorkingWeightKg !== 42.5) {
  console.log(`❌ FAIL: Expected 42.5 kg, got ${decision.nextWorkingWeightKg}`);
  process.exit(1);
}

console.log(`✅ PASS: Barbell snaps to 2.5 kg grid (42.5 kg)`);
process.exit(0);
