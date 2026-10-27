#!/usr/bin/env tsx
/**
 * Test that success increases are capped at ONE equipment grid step.
 * 
 * Issue: Barbell Squat 72.5 → 80 (+7.5 kg, 3 steps) after one good session.
 * Expected: Should increase by only ONE step (2.5 kg) to 75 kg.
 */

import { evaluateProgression } from "../src/lib/program/progression.js";
import type { ExerciseMeta, ProgressState, LoggedSet } from "../src/lib/program/progression.js";

const SQUAT: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "squat",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const LUNGE: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "squat",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function makeState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    currentWorkingWeightKg: null,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: null,
    bestE1rm: null,
    totalSessions: 0, weightAtFailureStartKg: null,
    ...overrides,
  };
}

function makeSet(reps: number, weightKg: number): LoggedSet {
  return { reps, weightKg };
}

let passed = 0;
let failed = 0;

function check(description: string, condition: boolean) {
  if (condition) {
    console.log(`  ok   ${description}`);
    passed++;
  } else {
    console.log(`  FAIL ${description}`);
    failed++;
  }
}

console.log("\n=== Issue (A): Success Increase Capping ===\n");

console.log("Case 1: Barbell Squat 72.5 kg, all sets hit, RIGHT feel");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
    ],
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: SQUAT,
    state: makeState({ currentWorkingWeightKg: 72.5 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  console.log(`  Message: "${d.message}"`);
  
  // Expected: ONE increment = 5 kg, max(2.5 grid, 5 increment) = 5 kg → 72.5 + 5 = 77.5 kg
  check("Barbell squat 72.5 kg (RIGHT feel) → 77.5 kg (one increment)", d.nextWorkingWeightKg === 77.5);
  check("  outcome is progressed", d.outcome === "progressed");
}

console.log("\nCase 2: Barbell Squat 72.5 kg, all sets hit, EASY feel");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
      makeSet(12, 72.5),
    ],
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    equipmentIds: ["barbell"],
    
    meta: SQUAT,
    state: makeState({ currentWorkingWeightKg: 72.5 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  console.log(`  Message: "${d.message}"`);
  console.log(`  Jump: ${d.nextWorkingWeightKg !== null ? d.nextWorkingWeightKg - 72.5 : 'N/A'} kg`);
  // #120: With equipment, easy uses ONE grid step (not doubled)
  // 72.5 kg + 5 kg = 77.5 kg (one increment, not doubled)
  check("Barbell squat 72.5 kg (EASY feel) → 77.5 kg (one-step cap)", d.nextWorkingWeightKg === 77.5);
}

console.log("\nCase 3: Dumbbell Lunge 14 kg → check if snaps to 20 kg bar");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 14),
      makeSet(12, 14),
      makeSet(12, 14),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["dumbbell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 14 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Jump: ${d.nextWorkingWeightKg !== null ? d.nextWorkingWeightKg - 14 : 'N/A'} kg`);
  console.log(`  Message: "${d.message}"`);
  
  // Expected: increment = 5kg, max(2.5, 5) = 5kg → 14 + 5 = 19, snap to next dumbbell (17.5 or next loadable)
  check("Dumbbell lunge 14 kg → 17.5 kg (right feel, one increment)", d.nextWorkingWeightKg === 17.5);
}

// DB lunge 14 -> 15 (easy feel)
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 14 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    equipmentIds: ["dumbbell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 14 }),
    isDeload: false,
  });
  // #120: With equipment, easy uses ONE grid step (not doubled)
  // 14 kg + 2.5 kg = 16.5 → rounds up to 17.5 kg
  check("Dumbbell lunge 14 kg → 17.5 kg (easy feel, one-step cap)", d.nextWorkingWeightKg === 17.5);
}

// DB lunge 15 -> 17.5
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 15 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["dumbbell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 15 }),
    isDeload: false,
  });
  check("Dumbbell lunge 15 kg → 20 kg (one increment = 5kg)", d.nextWorkingWeightKg === 20);
}

// DB lunge 12 -> 12.5
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 12 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["dumbbell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 12 }),
    isDeload: false,
  });
  check("Dumbbell lunge 12 kg → 15 kg (increment = max(2.5, 5) = 5kg, snap to 15)", d.nextWorkingWeightKg === 15);
}

// Squat 72.5 -> 75 (easy)
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 72.5 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    equipmentIds: ["barbell"],
    
    meta: SQUAT,
    state: makeState({ currentWorkingWeightKg: 72.5 }),
    isDeload: false,
  });
  // #120: With equipment, easy uses ONE grid step (not doubled)
  // 72.5 kg + 5 kg = 77.5 kg (one increment, not doubled)
  check("Barbell squat 72.5 kg → 77.5 kg (easy feel, one-step cap)", d.nextWorkingWeightKg === 77.5);
}

// KB 22 -> 24
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 22 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    
    meta: CURL,
    state: makeState({ currentWorkingWeightKg: 22 }),
    isDeload: false,
  });
  check("Kettlebell 22 kg → 24 kg (one-step cap)", d.nextWorkingWeightKg === 24);
}

// Pin-stack 42 -> 45
{
  const d = evaluateProgression({
    sets: Array(4).fill({ reps: 12, weightKg: 42 }),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["lat_pulldown"],
    
    meta: CURL,
    state: makeState({ currentWorkingWeightKg: 42 }),
    isDeload: false,
  });
  check("Pin-stack 42 kg → 45 kg (one-step cap)", d.nextWorkingWeightKg === 45);
}

console.log("\nCase 4: Dumbbell 14 kg with EASY feel");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 14),
      makeSet(12, 14),
      makeSet(12, 14),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    equipmentIds: ["dumbbell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 14 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Jump: ${d.nextWorkingWeightKg !== null ? d.nextWorkingWeightKg - 14 : 'N/A'} kg`);
  
  // #120: With equipment, easy uses ONE grid step (not doubled)
  // 14 kg + 2.5 kg (dumbbell grid) = 16.5 → rounds up to 17.5 kg
  check("Dumbbell 14 kg (EASY) → 17.5 kg (one-step cap)", d.nextWorkingWeightKg === 17.5);
}

console.log("\nCase 5: Kettlebell 22 kg → next bell");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 22),
      makeSet(12, 22),
      makeSet(12, 22),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["kettlebell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 22 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Message: "${d.message}"`);
  
  // Kettlebells have irregular spacing, next bell after 22 is 24
  check("Kettlebell 22 kg → 24 kg (next bell)", d.nextWorkingWeightKg === 24);
}

console.log("\nCase 6: Kettlebell 22 kg with EASY feel");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 22),
      makeSet(12, 22),
      makeSet(12, 22),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    equipmentIds: ["kettlebell"],
    
    meta: LUNGE,
    state: makeState({ currentWorkingWeightKg: 22 }),
    isDeload: false,
  });
  
  console.log(`  Next weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Message: "${d.message}"`);
  
  // #120: With equipment, easy uses ONE grid step (not doubled)
  // For kettlebells: 22 → 24 kg (next bell, same for right and easy)
  check("Kettlebell 22 kg (EASY) → 24 kg (one bell, not two)", d.nextWorkingWeightKg === 24);
}

console.log("\n" + "=".repeat(60));
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}
