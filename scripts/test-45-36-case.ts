#!/usr/bin/env tsx
import { evaluateProgression } from "../src/lib/program/progression.js";

const MILITARY_PRESS = {
  mechanic: "compound" as const,
  metric: "reps" as const,
  movementPattern: "vertical_press" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Testing: 45.36 kg (100 lb) Military Press 4x12 'right'");

// Test WITHOUT equipment
const noEquip = evaluateProgression({
  sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: MILITARY_PRESS,
  state: { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
  isDeload: false,
});

console.log("\nWithout equipment:");
console.log("  Next:", noEquip.nextWorkingWeightKg, "kg");
console.log("  Below lifted?", noEquip.nextWorkingWeightKg! < 45.36 ? "YES ❌" : "NO ✓");

// Test WITH barbell equipment
const withBarbell = evaluateProgression({
  sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: MILITARY_PRESS,
  state: { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

console.log("\nWith barbell, unit=lb:");
console.log("  Next:", withBarbell.nextWorkingWeightKg, "kg (", Math.round(withBarbell.nextWorkingWeightKg! * 2.20462 * 2) / 2, "lb )");
console.log("  Below lifted?", withBarbell.nextWorkingWeightKg! < 45.36 ? "YES ❌" : "NO ✓");
console.log("  Message:", withBarbell.message);

