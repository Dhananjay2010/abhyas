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

const tests: Array<{ weight: number; feel: "right" | "easy"; expected: number }> = [
  { weight: 8, feel: "right", expected: 10 },
  { weight: 8, feel: "easy", expected: 12 }, // Easy moves 2 bells (8→10→12)
  { weight: 16, feel: "right", expected: 18 },
  { weight: 16, feel: "easy", expected: 20 }, // Easy moves 2 bells (16→18→20)
  { weight: 24, feel: "right", expected: 28 },
  { weight: 24, feel: "easy", expected: 32 }, // Easy moves 2 bells (24→28→32)
  { weight: 32, feel: "right", expected: 36 },
  { weight: 32, feel: "easy", expected: 40 }, // Easy moves 2 bells (32→36→40)
  { weight: 48, feel: "right", expected: 48 }, // Top bell, should hold
  { weight: 48, feel: "easy", expected: 48 }, // Top bell, should hold
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
    unit: "kg",
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
  
  const note = t.feel === "easy" ? " (#120: easy = 2 bells, not skipping any)" : " (PR uses real bells, main invented non-existent weights)";
  
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
