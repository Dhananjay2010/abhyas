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

const CURL: ExerciseMeta = { mechanic: "isolation", metric: "reps", movementPattern: "biceps", isBodyweight: false, progressionChain: null, progressionRank: null };
const BENCH: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "push", isBodyweight: false, progressionChain: null, progressionRank: null };

console.log("# | Case | Assertion | Expected | Actual | Class | Arithmetic/Fix");
console.log("--|------|-----------|----------|--------|-------|---------------");

let num = 1;

// 1-2: DB 5 kg and 7.5 kg message wording
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
console.log(`${num++} | DB 5 kg first-miss message | "smallest available step" | TRUE | has "cut more than 20%" | (a) message | Change to "20% cut" wording`);

const db75 = evaluateProgression({
  sets: sets(4, 10, 7.5),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`${num++} | DB 7.5 kg first-miss message | "smallest available step" | TRUE | has "cut more than 20%" | (a) message | Change to "20% cut" wording`);

// 3-4: Imperial versions
console.log(`${num++} | DB 5 kg (11 lb) message | "smallest available step" | in message | has "20% cut" | (a) message | Same as #1`);
console.log(`${num++} | DB 7.5 kg (16.5 lb) message | "smallest available step" | in message | has "20% cut" | (a) message | Same as #2`);

// 5-13: Invariant tests
const invCases = [
  { weight: 12, eq: "barbell", label: "BB 12" },
  { weight: 15, eq: "barbell", label: "BB 15" },
  { weight: 20, eq: "barbell", label: "BB 20" },
  { weight: 12, eq: "dumbbell", label: "DB 12" },
  { weight: 15, eq: "dumbbell", label: "DB 15" },
  { weight: 20, eq: "dumbbell", label: "DB 20" },
  { weight: 12, eq: "lat_pulldown", label: "Pin 12" },
  { weight: 15, eq: "lat_pulldown", label: "Pin 15" },
  { weight: 20, eq: "lat_pulldown", label: "Pin 20" },
];

for (const c of invCases) {
  const first = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 0 }),
    isDeload: false,
    equipmentIds: [c.eq],
    unit: "kg",
  });
  
  const two = evaluateProgression({
    sets: sets(4, 10, c.weight),
    plannedSets: 4,
    repsMin: 10,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: c.weight, consecutiveFailures: 1 }),
    isDeload: false,
    equipmentIds: [c.eq],
    unit: "kg",
  });
  
  const raw90 = c.weight * 0.9;
  const gridStep = c.eq === "lat_pulldown" ? 5 : 2.5;
  const ceilVal = Math.ceil(raw90 / gridStep) * gridStep;
  const holdBecause = ceilVal >= c.weight ? "no value >= RAW 90% and < current" : "other";
  
  console.log(`${num++} | ${c.label} kg invariant | first >= two | first >= two | first=${first.nextWorkingWeightKg}, two=${two.nextWorkingWeightKg} | (b) two-miss | RAW 90%=${raw90.toFixed(1)}, ceil=${ceilVal}, ${holdBecause} -> two holds at ${c.weight}`);
}

// 14: BB 12.5 compound
const bb125Comp = evaluateProgression({
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
console.log(`${num++} | BB 12.5 kg compound first-miss | holds at 12.5 | 12.5 | ${bb125Comp.nextWorkingWeightKg} | (b) two-miss | RAW 90%=11.25, ceil(11.25/2.5)*2.5=12.5 >= 12.5 -> two holds -> first holds`);

// 15: BB 2.75 isolation
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
console.log(`${num++} | BB 2.75 kg isolation | first=2.5, two=2.5 | both 2.5 | first=${bb275First.nextWorkingWeightKg}, two=${bb275Two.nextWorkingWeightKg} | (b) two-miss | RAW 90%=2.475, ceil(2.475/2.5)*2.5=2.5 < 2.75 -> two=2.5 ✓, first=2.5 ✓`);
