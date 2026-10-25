/**
 * MEDIUM-3: Test swapExercise honours planning_mode (daily_menu).
 * 
 * - daily_menu planning mode should get null currentTargetReps (no progression memory)
 * - resolveSwapWeights should read current_target_reps from progress
 */

import { progressForPlanningMode } from "@/lib/session/swap-progress";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing swapExercise planning_mode handling\n");

// Mock progress data
const mockProgress = {
  exercise_id: "pushup",
  current_working_weight_kg: null,
  current_target_reps: 14,
};

// --- Test 1: progression mode remembers weights and targets ---
const progressionResult = progressForPlanningMode("progression", mockProgress);

check(
  "progression mode: current_target_reps = 14",
  progressionResult?.current_target_reps === 14
);

check(
  "progression mode: current_working_weight_kg = null",
  progressionResult?.current_working_weight_kg === null
);

// --- Test 2: daily_menu mode returns undefined (no memory) ---
const dailyMenuResult = progressForPlanningMode("daily_menu", mockProgress);

check(
  "daily_menu mode: returns null (no progression memory)",
  dailyMenuResult === null
);

// --- Test 3: progression mode with loaded exercise ---
const loadedProgress = {
  exercise_id: "squat",
  current_working_weight_kg: 100,
  current_target_reps: 10,
};

const loadedProgressionResult = progressForPlanningMode("progression", loadedProgress);

check(
  "progression mode (loaded): current_working_weight_kg = 100",
  loadedProgressionResult?.current_working_weight_kg === 100
);

check(
  "progression mode (loaded): current_target_reps = 10",
  loadedProgressionResult?.current_target_reps === 10
);

// --- Test 4: daily_menu mode with loaded exercise returns null ---
const loadedDailyMenuResult = progressForPlanningMode("daily_menu", loadedProgress);

check(
  "daily_menu mode (loaded): returns null",
  loadedDailyMenuResult === null
);

// --- Summary ---
console.log("");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed\n`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed\n`);
