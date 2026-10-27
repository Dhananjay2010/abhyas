#!/usr/bin/env tsx
import { evaluateProgression } from "../src/lib/program/progression.js";

const PUSHUP = {
  mechanic: "compound" as const,
  metric: "reps" as const,
  movementPattern: "horizontal_press" as const,
  isBodyweight: true,
  progressionChain: "push" as const,
  progressionRank: 1,
};

const d = evaluateProgression({
  sets: [{ reps: 12, weightKg: 25 }, { reps: 12, weightKg: 25 }, { reps: 12, weightKg: 25 }, { reps: 12, weightKg: 25 }],
  plannedSets: 4,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: PUSHUP,
  state: { currentWorkingWeightKg: 25, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
  isDeload: false,
  equipmentIds: ["dip_bars"],
  unit: "kg",
});

console.log("Dip bars test:");
console.log("  Current: 25 kg");
console.log("  Next:", d.nextWorkingWeightKg, "kg");
console.log("  Expected: 26.25 kg (25 + 1.25)");
console.log("  Got correct?", d.nextWorkingWeightKg === 26.25 ? "YES ✓" : `NO ✗ (got ${d.nextWorkingWeightKg})`);
