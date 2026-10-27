#!/usr/bin/env tsx
/**
 * Tests for nextSetTarget() calculation with pending sets
 * 
 * Updated to test the real runtime path (nextSetTarget) instead of
 * the deleted nextSetNumberFor helper.
 */

import { nextSetTarget, type ResumeExercise } from "../src/lib/session/resume-state";

console.log("\n--- nextSetTarget calculation tests ---\n");

let failed = false;

function makeExercise(id: string, setsDone: number[]): ResumeExercise {
  return {
    id,
    status: "pending",
    plannedSets: 5,
    sets: setsDone.map(n => ({ setNumber: n, reps: 10, weightKg: 50, durationSeconds: null })),
    lastLoggedAt: null
  };
}

// Test 1: No sets done, no pending
const ex1 = [makeExercise("ex1", [])];
const test1 = nextSetTarget(ex1, "ex1", []);
if (test1?.setNumber !== 1) {
  console.error(`❌ Expected 1, got ${test1?.setNumber}`);
  failed = true;
} else {
  console.log("✓ No sets done, no pending → set number 1");
}

// Test 2: 2 sets done, no pending
const ex2 = [makeExercise("ex2", [1, 2])];
const test2 = nextSetTarget(ex2, "ex2", []);
if (test2?.setNumber !== 3) {
  console.error(`❌ Expected 3, got ${test2?.setNumber}`);
  failed = true;
} else {
  console.log("✓ 2 sets done, no pending → set number 3");
}

// Test 3: 2 sets done, 1 pending
const ex3 = [makeExercise("ex3", [1, 2])];
const pending3 = [{ sessionExerciseId: "ex3", setNumber: 3 }];
const test3 = nextSetTarget(ex3, "ex3", pending3);
if (test3?.setNumber !== 4) {
  console.error(`❌ Expected 4, got ${test3?.setNumber}`);
  failed = true;
} else {
  console.log("✓ 2 sets done, 1 pending → set number 4");
}

// Test 4: 0 sets done, 2 pending (logged during session expiry)
const ex4 = [makeExercise("ex4", [])];
const pending4 = [
  { sessionExerciseId: "ex4", setNumber: 1 },
  { sessionExerciseId: "ex4", setNumber: 2 }
];
const test4 = nextSetTarget(ex4, "ex4", pending4);
if (test4?.setNumber !== 3) {
  console.error(`❌ Expected 3, got ${test4?.setNumber}`);
  failed = true;
} else {
  console.log("✓ 0 sets done, 2 pending → set number 3");
}

// Test 5: Edge case - many pending
const ex5 = [makeExercise("ex5", [1, 2, 3, 4, 5])];
const pending5 = [
  { sessionExerciseId: "ex5", setNumber: 6 },
  { sessionExerciseId: "ex5", setNumber: 7 },
  { sessionExerciseId: "ex5", setNumber: 8 }
];
const test5 = nextSetTarget(ex5, "ex5", pending5);
if (test5?.setNumber !== 9) {
  console.error(`❌ Expected 9, got ${test5?.setNumber}`);
  failed = true;
} else {
  console.log("✓ 5 sets done, 3 pending → set number 9");
}

// Test 6: Gaps in saved sets (e.g. [1, 3]) should give next = 4
const ex6 = [makeExercise("ex6", [1, 3])];
const test6 = nextSetTarget(ex6, "ex6", []);
if (test6?.setNumber !== 4) {
  console.error(`❌ Expected 4 for gaps [1,3], got ${test6?.setNumber}`);
  failed = true;
} else {
  console.log("✓ Gaps in saved [1, 3] give next set number 4");
}

if (failed) {
  console.log("\n❌ nextSetTarget tests FAILED\n");
  process.exit(1);
} else {
  console.log("\n✅ All nextSetTarget tests passed\n");
}


