#!/usr/bin/env tsx
/**
 * Comprehensive test: core progression logic through real caller path
 * 
 * Tests coordinator decisions A-F with exact values:
 * - 45.36 kg Military Press (stored 40, lifted 45.36) → 47.5 right, 50 easy
 * - Imperial round-down: 57.5 kg → "126.5 lb" not "127 lb"
 * - Display-weight equality: 47.49→47.5 both show "104.5 lb" → hold message
 * - Cap: next - lifted ≤ one increment (or 2× for easy)
 * - First miss always holds (decision F)
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`✓ ${desc}`);
  }
}

const PRESS: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_press",
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

console.log("\n=== Comprehensive Progression Test ===\n");

// Test 1: 45.36 kg (100 lb) Military Press with stored 40 kg
console.log("1. Military Press 45.36 kg with stored 40 kg (QA bug fix)");
{
  const sets = [
    { reps: 12, weightKg: 45.36 },
    { reps: 12, weightKg: 45.36 },
    { reps: 12, weightKg: 45.36 },
    { reps: 12, weightKg: 45.36 },
  ];
  
  const rightDecision = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 40, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("  right: next = 47.5 kg (mode 45.36 + 2.5, floor-snap)", rightDecision.nextWorkingWeightKg === 47.5, `got ${rightDecision.nextWorkingWeightKg}`);
  check("  right: cap satisfied (47.5 - 45.36 = 2.14 ≤ 2.5)", (rightDecision.nextWorkingWeightKg ?? 0) - 45.36 <= 2.5);
  
  const easyDecision = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "easy",
    meta: PRESS,
    state: { currentWorkingWeightKg: 40, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("  easy: next = 50 kg (mode 45.36 + 5, floor-snap)", easyDecision.nextWorkingWeightKg === 50, `got ${easyDecision.nextWorkingWeightKg}`);
  check("  easy: cap satisfied (50 - 45.36 = 4.64 ≤ 5)", (easyDecision.nextWorkingWeightKg ?? 0) - 45.36 <= 5);
}

// Test 2: Imperial round-down for increases
console.log("\n2. Imperial increases round down (conservative)");
{
  const setsAt55 = [
    { reps: 12, weightKg: 55 },
    { reps: 12, weightKg: 55 },
    { reps: 12, weightKg: 55 },
  ];
  
  const decision = evaluateProgression({
    sets: setsAt55,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 55, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  // 55 + 2.5 = 57.5 kg = 126.77 lb, floor to 0.5 lb = 126.5 lb (not 127)
  check("  57.5 kg shows '126.5 lb' (down-rounded)", decision.message.includes("126.5 lb"), decision.message);
  check("  does NOT show '127 lb'", !decision.message.includes("127 lb"), decision.message);
}

// Test 3: Display-weight equality check (coordinator decision A)
console.log("\n3. Display-weight equality: tiny jumps show hold");
{
  // 47.49 kg + 1.25 = 48.74, floor-snap to 2.5 grid = 47.5
  // 47.49 kg = 104.72 lb → rounds to 104.5 lb
  // 47.5 kg = 104.72 lb → rounds to 104.5 lb
  // Both display as "104.5 lb", so show hold
  const setsAt4749 = [
    { reps: 12, weightKg: 47.49 },
    { reps: 12, weightKg: 47.49 },
    { reps: 12, weightKg: 47.49 },
  ];
  
  const decisionLb = evaluateProgression({
    sets: setsAt4749,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 47.49, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  check("  lb: outcome is hold (not progressed)", decisionLb.outcome === "hold", `got ${decisionLb.outcome}`);
  check("  lb: message says 'ready for next step' (not 'up to')", decisionLb.message.includes("ready for the next step"), decisionLb.message);
  
  // Same check in kg: 47.49 kg displays as "47.49 kg", 47.5 kg as "47.5 kg" → different, so progress
  const decisionKg = evaluateProgression({
    sets: setsAt4749,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 47.49, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("  kg: outcome is progressed", decisionKg.outcome === "progressed", `got ${decisionKg.outcome}`);
  check("  kg: next = 47.5", decisionKg.nextWorkingWeightKg === 47.5, `got ${decisionKg.nextWorkingWeightKg}`);
}

// Test 4: First miss always holds (coordinator decision F)
console.log("\n4. First miss always holds (with or without equipment)");
{
  const missingSets = [
    { reps: 7, weightKg: 60 },
    { reps: 7, weightKg: 60 },
    { reps: 7, weightKg: 60 },
  ];
  
  const noEquip = evaluateProgression({
    sets: missingSets,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 60, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
  });
  
  check("  no equipment: holds at 60", noEquip.nextWorkingWeightKg === 60, `got ${noEquip.nextWorkingWeightKg}`);
  check("  failures = 1", noEquip.consecutiveFailures === 1);
  
  const withEquip = evaluateProgression({
    sets: missingSets,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 60, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("  with barbell: holds at 60", withEquip.nextWorkingWeightKg === 60, `got ${withEquip.nextWorkingWeightKg}`);
  check("  failures = 1", withEquip.consecutiveFailures === 1);
}

// Test 5: Second miss drops correctly
console.log("\n5. Second consecutive miss drops ~10%");
{
  const missingSets = [
    { reps: 7, weightKg: 60 },
    { reps: 7, weightKg: 60 },
    { reps: 7, weightKg: 60 },
  ];
  
  const decision = evaluateProgression({
    sets: missingSets,
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 60, currentTargetReps: 12, consecutiveFailures: 1, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 1, weightAtFailureStartKg: 60 },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("  drops to 52.5 kg (0.9 * 60 = 54, floor to grid)", decision.nextWorkingWeightKg === 52.5, `got ${decision.nextWorkingWeightKg}`);
  check("  outcome is backed_off", decision.outcome === "backed_off");
  check("  failures reset to 0", decision.consecutiveFailures === 0);
}

console.log(failures === 0 ? "\n✅ All comprehensive tests passed\n" : `\n❌ ${failures} test(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
