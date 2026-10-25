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

console.log("# | Case | Assertion | Expected | Actual | Class | Fix");
console.log("--|------|-----------|----------|--------|-------|----");

let num = 1;

// 1-2: Message wording for DB 5 and 7.5
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
console.log(`${num++} | DB 5 kg first-miss | message has "smallest available step" | TRUE | "${db5.message.includes("smallest available step")}" | (a) message | Update to "20% cut"`);

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
console.log(`${num++} | DB 7.5 kg first-miss | message has "smallest available step" | TRUE | "${db75.message.includes("smallest available step")}" | (a) message | Update to "20% cut"`);

// 3-4: Imperial message checks
console.log(`${num++} | DB 5 kg (11 lb) first-miss | holds + message has "smallest step" | hold + smallest | hold + "20% cut" | (a) message | Update to "20% cut"`);
console.log(`${num++} | DB 7.5 kg (16.5 lb) first-miss | holds + message has "smallest step" | hold + smallest | hold + "20% cut" | (a) message | Update to "20% cut"`);

// 5-13: Invariant failures
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
  const roundedTarget = Math.floor(raw90 / gridStep) * gridStep;
  const rawTarget = raw90;
  
  console.log(`${num++} | ${c.label} kg invariant | first >= two | first=${first.nextWorkingWeightKg} >= two=${roundedTarget} | first=${first.nextWorkingWeightKg}, two=${two.nextWorkingWeightKg} | (b) two-miss | Two-miss should be ${roundedTarget} (RAW ${raw90.toFixed(1)}, floor to grid)`);
}

// 14: BB 12.5
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
console.log(`${num++} | BB 12.5 kg compound first-miss | holds at 12.5 | 12.5 | ${bb125.nextWorkingWeightKg} | (c) CODE BUG | Drops to 10, but two-miss floor should prevent`);

// 15: BB 2.75
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
console.log(`${num++} | BB 2.75 kg isolation | first=2.5, two=2.5 | both 2.5 | first=${bb275First.nextWorkingWeightKg}, two=${bb275Two.nextWorkingWeightKg} | (a) message | Test correct, just update comment`);
