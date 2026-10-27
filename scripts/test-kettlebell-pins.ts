#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

const COMPOUND: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const tests = [
  { weight: 8, feel: "right" as const, expected: 10 },
  { weight: 8, feel: "easy" as const, expected: 10 }, // #120: easy moves 1 bell, not 2
  { weight: 16, feel: "right" as const, expected: 18 },
  { weight: 16, feel: "easy" as const, expected: 18 }, // #120: easy moves 1 bell, not 2
  { weight: 24, feel: "right" as const, expected: 28 },
  { weight: 24, feel: "easy" as const, expected: 28 }, // #120: easy moves 1 bell, not 2
  { weight: 32, feel: "right" as const, expected: 36 },
  { weight: 32, feel: "easy" as const, expected: 36 }, // #120: easy moves 1 bell, not 2
  { weight: 48, feel: "right" as const, expected: 48 }, // Top bell, should hold
  { weight: 48, feel: "easy" as const, expected: 48 }, // Top bell, should hold
];

let failures = 0;
for (const t of tests) {
  const result = evaluateProgression({
    sets: [{reps: 12, weightKg: t.weight, durationSeconds: null}, {reps: 12, weightKg: t.weight, durationSeconds: null}, {reps: 12, weightKg: t.weight, durationSeconds: null}],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: t.feel,
    meta: COMPOUND,
    state: {currentWorkingWeightKg: t.weight, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: t.weight, bestReps: 12, bestE1rm: null, totalSessions: 5, weightAtFailureStartKg: null},
    isDeload: false,
    equipmentIds: ["kettlebell"],
    units: "metric",
  });
  
  const mainValue = t.weight === 8 && t.feel === "right" ? 15 :
                    t.weight === 8 && t.feel === "easy" ? 20 :
                    t.weight === 16 && t.feel === "right" ? 20 :
                    t.weight === 16 && t.feel === "easy" ? 25 :
                    t.weight === 24 && t.feel === "right" ? 30 :
                    t.weight === 24 && t.feel === "easy" ? 35 :
                    t.weight === 32 && t.feel === "right" ? 35 :
                    t.weight === 32 && t.feel === "easy" ? 40 :
                    t.weight === 48 && t.feel === "right" ? "N/A (top)" :
                    t.weight === 48 && t.feel === "easy" ? "N/A (top)" : 0;
  
  const note = t.feel === "easy" ? " (#120: easy = 1 bell with equipment, not 2)" : "";
  
  if (result.nextWorkingWeightKg !== t.expected) {
    console.log(`FAIL kettlebell ${t.weight} ${t.feel}: expected ${t.expected}, got ${result.nextWorkingWeightKg} (main: ${mainValue})${note}`);
    failures++;
  } else {
    console.log(`ok   kettlebell ${t.weight} ${t.feel}: ${result.nextWorkingWeightKg} kg (main: ${mainValue})${note}`);
  }
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failures`);
  process.exit(1);
} else {
  console.log(`\n✅ All kettlebell pins passed`);
}
