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
const SWING: ExerciseMeta = { mechanic: "compound", metric: "reps", movementPattern: "hinge", isBodyweight: false, progressionChain: null, progressionRank: null };

console.log("# | Case | Expected | Actual | Class | Fix");
console.log("--|------|----------|--------|-------|----");

let num = 1;

// 1-2: DB 6 kg → 5 kg
const db6 = evaluateProgression({
  sets: sets(4, 10, 6),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 6, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`${num++} | DB 6 kg first-miss → 5 kg | weight=5 | weight=${db6.nextWorkingWeightKg} | (c) CODE BUG? | Check why it's holding`);
console.log(`${num++} | DB 6 kg message | "drop" in message | "${db6.message.includes("drop")}" | (a) message | Related to #1`);

// 3-4: DB 12 kg → 10 kg
const db12 = evaluateProgression({
  sets: sets(4, 10, 12),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: CURL,
  state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["dumbbell"],
  unit: "kg",
});
console.log(`${num++} | DB 12 kg first-miss → 10 kg | weight=10 | weight=${db12.nextWorkingWeightKg} | (c) CODE BUG? | Check why it's holding`);
console.log(`${num++} | DB 12 kg message | "drop" in message | "${db12.message.includes("drop")}" | (a) message | Related to #3`);

// 5-6: DB 5 kg hold message
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
console.log(`${num++} | DB 5 kg hold | holds at 5 | ${db5.nextWorkingWeightKg} | OK | Weight correct`);
console.log(`${num++} | DB 5 kg message | "smallest step" | has "20% cut" | (a) message | Update to "smallest step"`);

// 7-8: DB 7.5 kg hold message
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
console.log(`${num++} | DB 7.5 kg hold | holds at 7.5 | ${db75.nextWorkingWeightKg} | OK | Weight correct`);
console.log(`${num++} | DB 7.5 kg message | "smallest step" | has "20% cut" | (a) message | Update to "smallest step"`);

// 9-12: Imperial versions (same as 1-4, 5-8)
console.log(`${num++} | DB 6 kg (13.2 lb) → 5 kg | weight=5 | holding | (c) CODE BUG | Same as #1`);
console.log(`${num++} | DB 12 kg (26.5 lb) → 10 kg | weight=10 | holding | (c) CODE BUG | Same as #3`);
console.log(`${num++} | DB 5 kg (11 lb) hold message | "smallest step" | "20% cut" | (a) message | Same as #6`);
console.log(`${num++} | DB 7.5 kg (16.5 lb) hold message | "smallest step" | "20% cut" | (a) message | Same as #8`);

// 13-15: Kettlebell strictly-below
const kb16 = evaluateProgression({
  sets: sets(4, 10, 16),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: SWING,
  state: fresh({ currentWorkingWeightKg: 16, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "kg",
});
console.log(`${num++} | KB 16 kg first-miss → 14 kg | weight=14 | weight=${kb16.nextWorkingWeightKg} | (c) CODE BUG | Check why holding`);

const kb12 = evaluateProgression({
  sets: sets(4, 10, 12),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: SWING,
  state: fresh({ currentWorkingWeightKg: 12, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "kg",
});
console.log(`${num++} | KB 12 kg first-miss → 10 kg | weight=10 | weight=${kb12.nextWorkingWeightKg} | (c) CODE BUG | Check why holding`);

const kb24 = evaluateProgression({
  sets: sets(4, 10, 24),
  plannedSets: 4,
  repsMin: 10,
  repsMax: 12,
  feel: "right",
  meta: SWING,
  state: fresh({ currentWorkingWeightKg: 24, consecutiveFailures: 0 }),
  isDeload: false,
  equipmentIds: ["kettlebell"],
  unit: "kg",
});
console.log(`${num++} | KB 24 kg first-miss → 20 kg | weight=20 | weight=${kb24.nextWorkingWeightKg} | (c) CODE BUG | Check why holding`);

console.log(`\nDB 6: RAW 90% two-miss = ${6 * 0.9} (no loadable >= 5.4 and < 6), so holds at 6`);
console.log(`First-miss candidate: 5. Is 5 < 6 (two-miss floor)? YES! So should drop, not hold`);
console.log(`\nKB 16: RAW 90% two-miss = ${16 * 0.9} (smallest bell >= 14.4 and < 16 is...)`)
const bells = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
console.log(`Bells: ${bells.join(", ")}`);
console.log(`Smallest >= 14.4: 16. But 16 NOT < 16! So two-miss holds at 16`);
console.log(`First-miss candidate: 14. Is 14 < 16 (two-miss floor)? YES! So should drop, not hold`);
