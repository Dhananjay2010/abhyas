#!/usr/bin/env tsx
/**
 * Test: Pending count per exercise helper
 * 
 * Updated to test the real runtime path (nextSetTarget) instead of
 * the deleted getPendingCountForExercise helper.
 * 
 * Tests that nextSetTarget correctly accounts for pending sets for
 * the specific exercise when calculating the next set number.
 */

import { nextSetTarget, type ResumeExercise } from "../src/lib/session/resume-state";
import type { PendingSet } from "../src/lib/session/pending-set-retry";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting nextSetTarget with pending sets per exercise\n");

function makeExercise(id: string, setsDone: number[]): ResumeExercise {
  return {
    id,
    status: "pending",
    plannedSets: 5,
    sets: setsDone.map(n => ({ setNumber: n, reps: 10, weightKg: 50, durationSeconds: null })),
    lastLoggedAt: null
  };
}

const exercises: ResumeExercise[] = [
  makeExercise("ex-1", []),
  makeExercise("ex-2", []),
  makeExercise("ex-3", []),
];

const pending: PendingSet[] = [
  {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "c1",
  },
  {
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "c2",
  },
  {
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 8,
    weightKg: 40,
    durationSeconds: null,
    clientId: "c3",
  },
];

// Test that nextSetTarget accounts for pending sets for the current exercise
const target1 = nextSetTarget(exercises, "ex-1", pending);
check("ex-1 with 2 pending → next is set 3", target1?.setNumber === 3);

const target2 = nextSetTarget(exercises, "ex-2", pending);
check("ex-2 with 1 pending → next is set 2", target2?.setNumber === 2);

const target3 = nextSetTarget(exercises, "ex-3", pending);
check("ex-3 with 0 pending → next is set 1", target3?.setNumber === 1);

// Test with empty pending
const target4 = nextSetTarget(exercises, "ex-1", []);
check("ex-1 with empty pending → next is set 1", target4?.setNumber === 1);

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);

