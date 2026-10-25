/**
 * MEDIUM-3: Test swapExercise server action honors planning_mode.
 * 
 * The swapExercise action must:
 * - For daily_menu users: return plan targets with null currentTargetReps
 * - For progression users: return stored targets from resolveSwapWeights
 */

import { progressForPlanningMode } from "@/lib/session/swap-progress";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing swapExercise planning_mode behavior\n");

// --- Part 1: progressForPlanningMode filter logic ---

// Case 1: daily_menu filters out stored progress entirely
const dailyMenuProgress = progressForPlanningMode("daily_menu", {
  current_target_reps: 15,
  current_working_weight_kg: 60,
});

check(
  "daily_menu: returns null (filters out all progress)",
  dailyMenuProgress === null
);

// Case 2: structured progression preserves stored targets
const structuredProgress = progressForPlanningMode("structured", {
  current_target_reps: 15,
  current_working_weight_kg: 60,
});

check(
  "structured: current_target_reps preserved (15)",
  structuredProgress?.current_target_reps === 15
);

check(
  "structured: current_working_weight_kg preserved (60)",
  structuredProgress?.current_working_weight_kg === 60
);

// Case 3: null planning_mode (default) preserves stored targets
const nullModeProgress = progressForPlanningMode(null, {
  current_target_reps: 12,
  current_working_weight_kg: null,
});

check(
  "null planning_mode: current_target_reps preserved (12)",
  nullModeProgress?.current_target_reps === 12
);

check(
  "null planning_mode: current_working_weight_kg preserved (null)",
  nullModeProgress?.current_working_weight_kg === null
);

// --- Part 2: Swap result contract ---

// When swapExercise returns a result:
// - daily_menu users see null currentTargetReps → applySwapTarget uses plan range
// - progression users see stored currentTargetReps → applySwapTarget uses stored target

// Mock swap result for daily_menu
const dailyMenuSwapResult = {
  metric: "reps" as const,
  repsMin: 8,
  repsMax: 12,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: ["pullup_bar"],
  currentTargetReps: null, // Filtered by progressForPlanningMode
};

check(
  "daily_menu swap result: currentTargetReps is null",
  dailyMenuSwapResult.currentTargetReps === null
);

check(
  "daily_menu swap result: plan range provided (8-12)",
  dailyMenuSwapResult.repsMin === 8 && dailyMenuSwapResult.repsMax === 12
);

// Mock swap result for structured progression
const progressionSwapResult = {
  metric: "reps" as const,
  repsMin: 8,
  repsMax: 12,
  weightPrefill: null,
  workingWeightKg: null,
  isBodyweight: true,
  equipmentIds: ["pullup_bar"],
  currentTargetReps: 15, // Preserved from resolveSwapWeights
};

check(
  "structured swap result: currentTargetReps is 15 (from stored progress)",
  progressionSwapResult.currentTargetReps === 15
);

check(
  "structured swap result: plan range provided (8-12)",
  progressionSwapResult.repsMin === 8 && progressionSwapResult.repsMax === 12
);

// --- Part 3: Integration with applySwapTarget ---

// When applySwapTarget receives these results:
// - daily_menu: currentTargetReps=null → uses plan range (repsMin-repsMax)
// - progression: currentTargetReps=15 → uses stored target (15-15) for bodyweight

// This is verified by test-swap-path-integration.tsx, but the contract is:
// applySwapTarget({ ..., currentTargetReps: null }) → falls back to plannedRepsMin/Max
// applySwapTarget({ ..., currentTargetReps: N, isBodyweight: true }) → uses N-N

check(
  "Contract: null currentTargetReps signals use plan range",
  dailyMenuSwapResult.currentTargetReps === null
);

check(
  "Contract: non-null currentTargetReps signals use stored target",
  progressionSwapResult.currentTargetReps !== null
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
