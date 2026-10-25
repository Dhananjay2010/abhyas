#!/usr/bin/env tsx
/**
 * Test that progression message and next working weight are consistent.
 * 
 * Issue: Session with 1 set 11×72.5 and 4 sets 12×70 produced message
 * "Staying at this weight" while next working weight became 72.5 (previous was 70).
 * 
 * The message and the prescribed number must agree: either the next weight stays 70
 * and the message says staying, or it goes up to 72.5 and the message says it went up.
 */

import { evaluateProgression } from "../src/lib/program/progression.js";
import type { ExerciseMeta, ProgressState, LoggedSet } from "../src/lib/program/progression.js";

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
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
    totalSessions: 0,
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

console.log("\n=== Issue (B): Message vs Weight Consistency ===\n");

console.log("Case 1: Mixed weights - 1 set at 72.5, 4 sets at 70, one missed target");
{
  // Working weight was 70, but user did one set at 72.5 (heavier than prescribed)
  // and missed target on that set (11 reps instead of 12)
  const d = evaluateProgression({
    sets: [
      makeSet(11, 72.5),  // Missed target (11 < 12)
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
    ],
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: makeState({ currentWorkingWeightKg: 70 }),
    isDeload: false,
  });
  
  console.log(`  Previous working weight: 70 kg`);
  console.log(`  Heaviest set: 72.5 kg`);
  console.log(`  Next working weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  console.log(`  Message: "${d.message}"`);
  
  // Check consistency
  const weightChanged = d.nextWorkingWeightKg !== 70;
  const messageIndicatesChange = 
    d.message.includes("up to") ||
    d.message.includes("dropping") ||
    d.message.includes("Missed the target — dropping");
  const messageIndicatesStay = 
    d.message.includes("Staying") ||
    d.message.includes("holding");
  
  console.log(`  Weight changed: ${weightChanged} (70 → ${d.nextWorkingWeightKg})`);
  console.log(`  Message indicates change: ${messageIndicatesChange}`);
  console.log(`  Message indicates stay: ${messageIndicatesStay}`);
  
  if (weightChanged && messageIndicatesStay) {
    console.log(`  ⚠️  BUG: Weight changed but message says "staying"`);
    check("  (documenting bug) weight changed but message says staying", false);
  } else if (!weightChanged && messageIndicatesChange) {
    console.log(`  ⚠️  BUG: Weight stayed but message says it changed"`);
    check("  (documenting bug) weight stayed but message says it changed", false);
  } else {
    check("Message and weight are consistent", true);
  }
  
  // The correct behavior should be: stay at 70 kg since target was missed
  check("Should stay at working weight 70 kg (missed target)", d.nextWorkingWeightKg === 70);
  check("  message should indicate staying/holding", messageIndicatesStay && !messageIndicatesChange);
}

console.log("\nCase 2: All sets at working weight, all hit target");
{
  const d = evaluateProgression({
    sets: [
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
    ],
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: makeState({ currentWorkingWeightKg: 70 }),
    isDeload: false,
  });
  
  console.log(`  Next working weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Message: "${d.message}"`);
  
  // Should progress
  check("All sets at target → progresses", d.outcome === "progressed");
  check("  message indicates progress", d.message.includes("up to"));
}

console.log("\nCase 3: Mixed weights - all hit target, heaviest > working");
{
  // User did some sets above working weight, all hit target
  const d = evaluateProgression({
    sets: [
      makeSet(12, 72.5),
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
    ],
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: makeState({ currentWorkingWeightKg: 70 }),
    isDeload: false,
  });
  
  console.log(`  Previous working weight: 70 kg`);
  console.log(`  All sets hit 12+ reps`);
  console.log(`  Heaviest: 72.5 kg`);
  console.log(`  Next working weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  console.log(`  Message: "${d.message}"`);
  
  // Should progress from working weight (70), not from heaviest (72.5)
  // Expected: 70 + 2.5 = 72.5
  check("Progresses from working weight 70 → 72.5", d.nextWorkingWeightKg === 72.5);
  check("  outcome is progressed", d.outcome === "progressed");
}

console.log("\nCase 4: Only heaviest weight available (no working weight in state)");
{
  // First session or working weight not recorded
  const d = evaluateProgression({
    sets: [
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: makeState({ currentWorkingWeightKg: null }),
    isDeload: false,
  });
  
  console.log(`  No previous working weight`);
  console.log(`  Heaviest: 70 kg`);
  console.log(`  Next working weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  
  // Should progress from heaviest
  check("Progresses from heaviest 70 → 72.5", d.nextWorkingWeightKg === 72.5);
}

console.log("\nCase 5: Partial completion - fewer sets than expected");
{
  // Only 3 sets done, all at working weight, all hit target
  const d = evaluateProgression({
    sets: [
      makeSet(12, 70),
      makeSet(12, 70),
      makeSet(12, 70),
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: makeState({ currentWorkingWeightKg: 70 }),
    isDeload: false,
  });
  
  console.log(`  Sets completed: 3`);
  console.log(`  Next working weight: ${d.nextWorkingWeightKg} kg`);
  console.log(`  Outcome: ${d.outcome}`);
  console.log(`  Message: "${d.message}"`);
  
  // Fewer sets is not a failure, should still progress if all hit target
  const stayed = d.nextWorkingWeightKg === 70;
  const progressed = d.nextWorkingWeightKg === 72.5;
  
  if (stayed) {
    console.log(`  → Stayed at 70 (requires 4+ sets?)`);
    check("  message consistent with staying", d.message.includes("Staying") || d.message.includes("holding"));
  } else if (progressed) {
    console.log(`  → Progressed to 72.5`);
    check("  message consistent with progress", d.message.includes("up to"));
  }
}

console.log("\n" + "=".repeat(60));
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed`);
  process.exit(0);
} else {
  console.log(`❌ ${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}
