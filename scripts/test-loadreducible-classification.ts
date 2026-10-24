#!/usr/bin/env tsx
/**
 * Test that loadReducibleFor correctly classifies exercises.
 * 
 * Mutant killer: If loadReducibleFor always returns true, this test fails
 * because holds and bodyweight exercises would incorrectly get set cuts.
 */

import { loadReducibleFor, isBodyweightOnly } from "@/lib/session/load-reducible";

console.log("\n🧪 Testing loadReducibleFor classification\n");

// Test 1: Weighted exercises with reps are load-reducible
const barbellReps = loadReducibleFor(["barbell"], "reps");
if (barbellReps !== true) {
  throw new Error(`Barbell with reps should be load-reducible, got ${barbellReps}`);
}
console.log("✓ Barbell + reps = load-reducible (true)");

// Test 2: Bodyweight exercises with reps are NOT load-reducible
const pullUpReps = loadReducibleFor(["pull_up_bar"], "reps");
if (pullUpReps !== false) {
  throw new Error(`Pull-up bar with reps should NOT be load-reducible, got ${pullUpReps}`);
}
console.log("✓ Pull-up bar + reps = NOT load-reducible (false)");

// Test 3: Holds (seconds) are NEVER load-reducible, even with weights
const plankHold = loadReducibleFor([], "seconds");
if (plankHold !== false) {
  throw new Error(`Plank hold should NOT be load-reducible, got ${plankHold}`);
}
console.log("✓ Plank (hold) = NOT load-reducible (false)");

const weightedHold = loadReducibleFor(["dumbbell"], "seconds");
if (weightedHold !== false) {
  throw new Error(`Weighted hold should NOT be load-reducible, got ${weightedHold}`);
}
console.log("✓ Weighted hold = NOT load-reducible (false)");

// Test 4: Empty equipment list (bodyweight, no equipment) with reps is NOT load-reducible
const bodyweightReps = loadReducibleFor([], "reps");
if (bodyweightReps !== false) {
  throw new Error(`Bodyweight (no equipment) with reps should NOT be load-reducible, got ${bodyweightReps}`);
}
console.log("✓ Bodyweight (no equipment) + reps = NOT load-reducible (false)");

// Test 5: isBodyweightOnly helper classification
if (isBodyweightOnly([]) !== true) {
  throw new Error("Empty equipment should be bodyweight-only");
}
console.log("✓ isBodyweightOnly([]) = true");

if (isBodyweightOnly(["pull_up_bar"]) !== true) {
  throw new Error("Pull-up bar should be bodyweight-only");
}
console.log("✓ isBodyweightOnly(['pull_up_bar']) = true");

if (isBodyweightOnly(["barbell"]) !== false) {
  throw new Error("Barbell should NOT be bodyweight-only");
}
console.log("✓ isBodyweightOnly(['barbell']) = false");

if (isBodyweightOnly(["pull_up_bar", "barbell"]) !== false) {
  throw new Error("Mixed equipment should NOT be bodyweight-only");
}
console.log("✓ isBodyweightOnly(['pull_up_bar', 'barbell']) = false");

console.log("\n✅ All loadReducibleFor classification tests passed\n");
