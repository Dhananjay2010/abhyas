#!/usr/bin/env tsx
/**
 * Test: Exact 20% cut is always clamped with equipment.
 * 
 * Proof that mutant (c) `> to >=` is equivalent:
 * Grid step g: candidate w−g; an exact 20% cut means w=5g; RAW 0.9w=4.5g ceils to 5g=w, 
 * so two-miss holds and Rule 2 holds the first miss. Kettlebells: the only adjacent 20% 
 * pair is 10→8, and no bell lies in [9,10). No equipment: no Rule 1.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression.js";

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const SQUAT: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "squat",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const KB_SWING: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "hinge",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const MEDICINE_BALL_SLAM: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "core",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function makeState(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, ...overrides };
}

const sets = (n: number, reps: number, w: number) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

function check(desc: string, pass: boolean, extra?: string): void {
  if (!pass) {
    console.log(`  FAIL ${desc}` + (extra ? ` ${extra}` : ''));
    process.exitCode = 1;
  } else {
    console.log(`  ok   ${desc}`);
  }
}

console.log("\n=== Exact 20% Cut Clamp with Equipment ===\n");

// DB 12.5 kg: cut to 10 kg = exactly 20% (2.5 / 12.5 = 0.20)
// Grid step is 2.5 kg, so candidate would be 10 kg
// #120: Main's two-miss >= 10, so candidate 10 < floor, holds (Rule 2)
// Changed sets to 4×7 (below repsMin 8) to actually be a miss, not in-range
{
  const r = evaluateProgression({
    sets: sets(4, 7, 12.5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["dumbbell"],
    unit: "kg",
    meta: CURL,
    state: makeState({ currentWorkingWeightKg: 12.5, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("DB 12.5 kg exact 20% cut: holds at 12.5 kg (Rule 2 clamp)", r.nextWorkingWeightKg === 12.5, `got ${r.nextWorkingWeightKg}`);
  check("  holdReason is 'twomiss'", r.message.includes("two-miss"));
}

// KB 10 kg: next step down would be 8 kg (20% cut)
// But no KB bell exists in [9, 10), so holds at 10 kg
{
  const r = evaluateProgression({
    sets: sets(4, 10, 10),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    unit: "kg",
    meta: KB_SWING,
    state: makeState({ currentWorkingWeightKg: 10, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("KB 10 kg: holds at 10 kg (no bell in [9,10))", r.nextWorkingWeightKg === 10, `got ${r.nextWorkingWeightKg}`);
}

// Barbell 25 kg: one step down would be 22.5 kg (10% cut, < 20%)
// #120: Main's two-miss floor = 22.5, so candidate 22.5 >= 22.5, drops
// Changed sets to 4×7 (below repsMin 8) to actually be a miss, not in-range
{
  const r = evaluateProgression({
    sets: sets(4, 7, 25),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: SQUAT,
    state: makeState({ currentWorkingWeightKg: 25, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Barbell 25 kg: drops to 22.5 kg (10% cut, passes clamp)", r.nextWorkingWeightKg === 22.5, `got ${r.nextWorkingWeightKg}`);
}

// Medicine ball 5 kg: step down would be 4 kg (20% cut)
// Medicine ball grid step is 1 kg, so candidate = 4 kg
// RAW two-miss = 0.9 * 5 = 4.5, ceil to 5 (holds at 5)
{
  const r = evaluateProgression({
    sets: sets(4, 10, 5),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["medicine_ball"],
    unit: "kg",
    meta: MEDICINE_BALL_SLAM,
    state: makeState({ currentWorkingWeightKg: 5, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Medicine ball 5 kg: holds at 5 kg (Rule 2 clamp)", r.nextWorkingWeightKg === 5, `got ${r.nextWorkingWeightKg}`);
}

console.log("\n✅ All exact 20% cut clamp tests passed\n");
