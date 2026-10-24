/**
 * Test that bodyweight progression uses Math.max(currentTargetReps, repsMax) (Mutant C)
 * 
 * Scenario: A user previously progressed to 14 reps, then the program changed the
 * repsMax to 12. Without the guard, progression would use 10 (the stale lower target)
 * and progress to 12, then 14 again. With the guard, it starts from 12 and progresses to 14.
 */
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nProgression max guard: stale lower target scenario");

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "vertical_pull",
  metric: "reps",
  isBodyweight: true,
  progressionChain: "pullup_chain",
  progressionRank: 1,
};

// User had progressed to 10 reps, but plan now prescribes 8-12
const state: ProgressState = {
  currentWorkingWeightKg: null,
  currentTargetReps: 10,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: 10,
  bestE1rm: null,
  totalSessions: 5,
};

// User completed 3x12 unloaded
const result = evaluateProgression({
  sets: [
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "good",
  meta,
  state,
  isDeload: false,
});

check("progressed outcome", result.outcome === "progressed", `got ${result.outcome}`);
check("new target is 14 (max(10,12) + 2)", result.nextTargetReps === 14, 
  `got ${result.nextTargetReps}, expected 14 from Math.max(10, 12) + 2`);
check("WITHOUT max guard, would be 12 (10 + 2)", result.nextTargetReps === 14,
  "mutant C would produce 12 (10+2), real code produces 14 (max(10,12)+2)");

console.log("\nProgression max guard: normal progression");

const state2: ProgressState = {
  currentWorkingWeightKg: null,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: null,
  bestReps: 12,
  bestE1rm: null,
  totalSessions: 3,
};

const result2 = evaluateProgression({
  sets: [
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
    { reps: 12, weightKg: null },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "good",
  meta,
  state: state2,
  isDeload: false,
});

check("progressed outcome", result2.outcome === "progressed", `got ${result2.outcome}`);
check("new target is 14 (max(12,12) + 2)", result2.nextTargetReps === 14,
  `got ${result2.nextTargetReps}`);

if (failures > 0) {
  console.log(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
