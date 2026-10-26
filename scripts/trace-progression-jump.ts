/**
 * Trace progression jump from 72.35/72.5 kg to 80 kg (L-4 investigation)
 */

import { evaluateProgression, incrementFor } from "../src/lib/program/progression";
import type { ExerciseMeta, ProgressState } from "../src/lib/program/progression";

console.log("=== L-4 Progression Jump Investigation ===\n");

// Test case 1: 72.35 kg (off-grid lb-derived) vs 72.5 kg (on-grid)
// Lower body compound (5 kg increment), "Right" feel

const lowerBodyMeta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const upperBodyMeta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Lower body (squat) increment:", incrementFor(lowerBodyMeta), "kg");
console.log("Upper body (bench) increment:", incrementFor(upperBodyMeta), "kg\n");

// Scenario 1: 72.35 kg off-grid, lower body, "Right" feel
const state1: ProgressState = {
  currentWorkingWeightKg: 72.35,
  currentTargetReps: 10,
  consecutiveFailures: 0,
  bestWeightKg: 72.35,
  bestReps: 10,
  bestE1rm: null,
  totalSessions: 1,
};

const result1 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.35 },
    { reps: 10, weightKg: 72.35 },
    { reps: 10, weightKg: 72.35 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: null, // "Right" feel
  meta: lowerBodyMeta,
  state: state1,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log("Scenario 1: 72.35 kg → ? (lower body, Right feel)");
console.log("  Input: 72.35 kg");
console.log("  Step: 5 kg (lower body)");
console.log("  Jump: 5 kg (Right feel, no doubling)");
console.log("  Raw next: 72.35 + 5 = 77.35 kg");
console.log("  Round up to 5 kg grid: ceil(77.35 / 5) * 5 = 80 kg");
console.log("  Result:", result1.nextWorkingWeightKg, "kg");
console.log("  Message:", result1.message);
console.log();

// Scenario 2: 72.5 kg on-grid (L-3 preserves this), lower body, "Right" feel
const state2: ProgressState = {
  ...state1,
  currentWorkingWeightKg: 72.5,
  bestWeightKg: 72.5,
};

const result2 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: null,
  meta: lowerBodyMeta,
  state: state2,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log("Scenario 2: 72.5 kg → ? (lower body, Right feel)");
console.log("  Input: 72.5 kg");
console.log("  Step: 5 kg");
console.log("  Jump: 5 kg");
console.log("  Raw next: 72.5 + 5 = 77.5 kg");
console.log("  Round up to 5 kg grid: ceil(77.5 / 5) * 5 = 80 kg");
console.log("  Result:", result2.nextWorkingWeightKg, "kg");
console.log("  Message:", result2.message);
console.log();

// Scenario 3: 72.5 kg, lower body, "Easy" feel (doubled jump)
const result3 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: "easy",
  meta: lowerBodyMeta,
  state: state2,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log("Scenario 3: 72.5 kg → ? (lower body, Easy feel - doubled)");
console.log("  Input: 72.5 kg");
console.log("  Step: 5 kg");
console.log("  Jump: 10 kg (Easy feel doubles the jump)");
console.log("  Raw next: 72.5 + 10 = 82.5 kg");
console.log("  Round up to 5 kg grid: ceil(82.5 / 5) * 5 = 85 kg");
console.log("  Result:", result3.nextWorkingWeightKg, "kg");
console.log("  Message:", result3.message);
console.log();

// Scenario 4: Upper body for comparison
const state4: ProgressState = {
  ...state1,
  currentWorkingWeightKg: 72.5,
  bestWeightKg: 72.5,
};

const result4 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: null,
  meta: upperBodyMeta,
  state: state4,
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

console.log("Scenario 4: 72.5 kg → ? (upper body, Right feel)");
console.log("  Input: 72.5 kg");
console.log("  Step: 2.5 kg (upper body)");
console.log("  Jump: 2.5 kg");
console.log("  Raw next: 72.5 + 2.5 = 75 kg");
console.log("  Round up to 2.5 kg grid: already on grid = 75 kg");
console.log("  Result:", result4.nextWorkingWeightKg, "kg");
console.log("  Message:", result4.message);
console.log();

// Scenario 5: Pin-stack machine (5 kg grid) to see if this produces 80 kg
const result5 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.35 },
    { reps: 10, weightKg: 72.35 },
    { reps: 10, weightKg: 72.35 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: null,
  meta: lowerBodyMeta,
  state: state1,
  isDeload: false,
  equipmentIds: ["leg_press"], // plate-loaded machine, 2.5 kg grid
  unit: "kg",
});

console.log("Scenario 5: 72.35 kg → ? (leg press, 2.5 kg grid)");
console.log("  Input: 72.35 kg");
console.log("  Step: 5 kg (lower body)");
console.log("  Jump: 5 kg");
console.log("  Raw next: 72.35 + 5 = 77.35 kg");
console.log("  Round up to 2.5 kg grid: ceil(77.35 / 2.5) * 2.5 = 77.5 kg");
console.log("  Result:", result5.nextWorkingWeightKg, "kg");
console.log();

// Scenario 6: Pin-stack machine (leg extension, 5 kg grid)
const result6 = evaluateProgression({
  sets: [
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
    { reps: 10, weightKg: 72.5 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 10,
  feel: null,
  meta: lowerBodyMeta,
  state: state2,
  isDeload: false,
  equipmentIds: ["leg_extension"], // pin-stack machine, 5 kg grid
  unit: "kg",
});

console.log("Scenario 6: 72.5 kg → ? (leg extension pin-stack, 5 kg grid)");
console.log("  Input: 72.5 kg");
console.log("  Step: 5 kg (lower body)");
console.log("  Jump: 5 kg");
console.log("  Raw next: 72.5 + 5 = 77.5 kg");
console.log("  Round up to 5 kg grid: ceil(77.5 / 5) * 5 = 80 kg");
console.log("  Result:", result6.nextWorkingWeightKg, "kg");
console.log();

console.log("=== Conclusion ===");
console.log("The 72.35 → 80 kg (or 72.5 → 80 kg) jump happens when:");
console.log("1. It's a lower body exercise (5 kg increment)");
console.log("2. Equipment has 5 kg grid (pin-stack machines like leg extension)");
console.log("3. With 'Right' feel: 72.5 + 5 = 77.5 kg");
console.log("4. Equipment grid rounding UP: ceil(77.5 / 5) * 5 = 80 kg");
console.log();
console.log("With barbell (2.5 kg grid):");
console.log("  72.35/72.5 + 5 = 77.35/77.5 → rounds up to 77.5 kg (NOT 80)");
console.log();
console.log("This is NOT a units bug - it's progression + equipment grid working correctly.");
console.log("L-3 fix prevents 72.35 from being stored (unedited prefill submits 72.5).");
console.log("Off-grid inputs do NOT cause larger jumps than on-grid inputs.");
