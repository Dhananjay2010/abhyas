#!/usr/bin/env tsx
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";

const sets = (n: number, reps: number, w: number) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const BENCH: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "push", isBodyweight: false, progressionChain: null, progressionRank: null };
const CURL: ExerciseMeta = { mechanic: "isolation", metric: "reps", movementPattern: "biceps", isBodyweight: false, progressionChain: null, progressionRank: null };

console.log("\nFailure Analysis:\n");

// Check invariant cases
const cases = [
  { weight: 12, equipmentIds: ["barbell"], label: "BB 12" },
  { weight: 15, equipmentIds: ["barbell"], label: "BB 15" },
  { weight: 20, equipmentIds: ["barbell"], label: "BB 20" },
];

for (const c of cases) {
  const firstMiss = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 0 }),
    isDeload: false,
    equipmentIds: c.equipmentIds,
    unit: "kg",
  });
  
  const twoMiss = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: c.equipmentIds,
    unit: "kg",
  });
  
  console.log(`${c.label}: first=${firstMiss.nextWorkingWeightKg}, two=${twoMiss.nextWorkingWeightKg}, RAW 90%=${c.weight * 0.9}`);
}

// Check 12.5 case
const bb125 = evaluateProgression({
  sets: sets(4, 10, 12.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: BENCH,
  state: fresh({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});
console.log(`\nBB 12.5 first-miss: ${bb125.nextWorkingWeightKg} (expected HOLD at 12.5, but drops to 10)`);

// Check 2.75 case
const bb275First = evaluateProgression({
  sets: sets(4, 10, 2.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});

const bb275Two = evaluateProgression({
  sets: sets(4, 10, 2.75),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 2.75, consecutiveFailures: 1 }),
  isDeload: false,
  equipmentIds: ["barbell"],
  unit: "kg",
});
console.log(`\nBB 2.75 isolation: first=${bb275First.nextWorkingWeightKg}, two=${bb275Two.nextWorkingWeightKg}`);
console.log(`  RAW 90% = ${2.75 * 0.9}`);

// Check message for 5 kg
const db5 = evaluateProgression({
  sets: sets(4, 10, 5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`\nDB 5 first-miss: ${db5.nextWorkingWeightKg}, message: "${db5.message}"`);
