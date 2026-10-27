#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

const tests: Array<{name: string, meta: ExerciseMeta, weight: number, feel: "easy" | "right", expected: number, expectedMsg?: string, equipmentIds?: string[]}> = [
  {
    name: "barbell 40 easy",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 40,
    feel: "easy",
    expected: 45,
    expectedMsg: "All sets at the top and it felt easy — up to 45 kg.",
    equipmentIds: ["barbell"]
  },
  {
    name: "barbell 40 right",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 40,
    feel: "right",
    expected: 42.5,
    equipmentIds: ["barbell"]
  },
  {
    name: "dumbbell 20 easy",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 20,
    feel: "easy",
    expected: 25,
    equipmentIds: ["dumbbell"]
  },
  {
    name: "cable 30 easy",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 30,
    feel: "easy",
    expected: 35,
    equipmentIds: ["cable_machine"]
  },
  {
    name: "barbell isolation 40 easy",
    meta: {mechanic: "isolation", movementPattern: "calf", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 40,
    feel: "easy",
    expected: 42.5,
    equipmentIds: ["barbell"]
  },
  {
    name: "barbell 72.35 easy",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 72.35,
    feel: "easy",
    expected: 75,
    equipmentIds: ["barbell"]
  },
  {
    name: "barbell 72.35 right",
    meta: {mechanic: "compound", movementPattern: "horizontal_press", metric: "reps", isBodyweight: false, progressionChain: null, progressionRank: null},
    weight: 72.35,
    feel: "right",
    expected: 72.5,
    equipmentIds: ["barbell"]
  },
];

let failures = 0;
for (const t of tests) {
  const result = evaluateProgression({
    sets: [{reps: 12, weightKg: t.weight, durationSeconds: null}, {reps: 12, weightKg: t.weight, durationSeconds: null}, {reps: 12, weightKg: t.weight, durationSeconds: null}],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: t.feel,
    meta: t.meta,
    state: {currentWorkingWeightKg: t.weight, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: t.weight, bestReps: 12, bestE1rm: null, totalSessions: 5, weightAtFailureStartKg: null},
    isDeload: false,
    equipmentIds: t.equipmentIds,
    units: "metric"
  });
  
  if (result.nextWorkingWeightKg !== t.expected) {
    console.log(`FAIL ${t.name}: expected ${t.expected}, got ${result.nextWorkingWeightKg}`);
    failures++;
  } else {
    console.log(`ok   ${t.name}: ${result.nextWorkingWeightKg} kg`);
  }
  
  if (t.expectedMsg && result.message !== t.expectedMsg) {
    console.log(`FAIL ${t.name} message: expected "${t.expectedMsg}", got "${result.message}"`);
    failures++;
  } else if (t.expectedMsg) {
    console.log(`ok   ${t.name} message`);
  }
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failures`);
  process.exit(1);
} else {
  console.log(`\n✅ All easy doubling pins passed`);
}
