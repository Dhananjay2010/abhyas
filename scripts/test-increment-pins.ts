#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

const SQUAT: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

type Test = {
  name: string;
  meta: ExerciseMeta;
  weight: number;
  feel: "right" | "easy";
  equipmentIds: string[];
  expected: number;
};

const tests: Test[] = [
  // Lower-body compound: 5kg increment
  { name: "barbell squat 40 right", meta: SQUAT, weight: 40, feel: "right", equipmentIds: ["barbell"], expected: 45 },
  { name: "barbell squat 40 easy", meta: SQUAT, weight: 40, feel: "easy", equipmentIds: ["barbell"], expected: 50 },
  
  // Upper-body compound: 2.5kg increment
  { name: "barbell bench 40 right", meta: BENCH, weight: 40, feel: "right", equipmentIds: ["barbell"], expected: 42.5 },
  { name: "barbell bench 40 easy", meta: BENCH, weight: 40, feel: "easy", equipmentIds: ["barbell"], expected: 45 },
  
  // Dumbbell upper: 2.5kg increment (dumbbell has 2.5kg grid)
  { name: "dumbbell 20 right", meta: BENCH, weight: 20, feel: "right", equipmentIds: ["dumbbell"], expected: 22.5 },
  { name: "dumbbell 20 easy", meta: BENCH, weight: 20, feel: "easy", equipmentIds: ["dumbbell"], expected: 25 },
  
  // Off-grid upper: 72.35 right → floor to 70, add 2.5 = 72.5
  { name: "barbell bench 72.35 right", meta: BENCH, weight: 72.35, feel: "right", equipmentIds: ["barbell"], expected: 72.5 },
  
  // Off-grid lower: 72.35 right → floor to 70, add 5 = 75
  { name: "barbell squat 72.35 right", meta: SQUAT, weight: 72.35, feel: "right", equipmentIds: ["barbell"], expected: 75 },
];

let failures = 0;
for (const t of tests) {
  const result = evaluateProgression({
    sets: [
      { reps: 12, weightKg: t.weight, durationSeconds: null },
      { reps: 12, weightKg: t.weight, durationSeconds: null },
      { reps: 12, weightKg: t.weight, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: t.feel,
    meta: t.meta,
    state: {
      currentWorkingWeightKg: t.weight,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: t.weight,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 5,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: t.equipmentIds,
    units: "metric",
  });
  
  if (result.nextWorkingWeightKg !== t.expected) {
    console.log(`FAIL ${t.name}: expected ${t.expected}, got ${result.nextWorkingWeightKg}`);
    failures++;
  } else {
    console.log(`ok   ${t.name}: ${result.nextWorkingWeightKg} kg`);
  }
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failures`);
  process.exit(1);
} else {
  console.log(`\n✅ All increment pins passed`);
}
