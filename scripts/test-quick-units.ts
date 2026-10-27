#!/usr/bin/env tsx
import { evaluateProgression } from "../src/lib/program/progression.js";

const CURL = {
  mechanic: "isolation" as const,
  metric: "reps" as const,
  movementPattern: "biceps" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

// Test: Imperial user sees lb in messages
const decision = evaluateProgression({
  sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: { currentWorkingWeightKg: 45.36, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "lb",
});

console.log("45.36 kg = 100 lb, barbell isolation success with unit='lb'");
console.log("Message:", decision.message);
console.log("Next weight:", decision.nextWorkingWeightKg, "kg");
console.log("✓ Includes 'lb'?", decision.message.includes("lb"));
console.log("✓ No 'kg'?", !decision.message.includes("kg"));

const pass = decision.message.includes("lb") && !decision.message.includes("kg");
console.log(pass ? "\n✅ PASS: Units working in messages" : "\n❌ FAIL: Units not working");
process.exit(pass ? 0 : 1);
