#!/usr/bin/env tsx
/**
 * Test: getPendingCountForExercise helper
 * 
 * Tests break 1b: the runner must pass the correct pending count to nextSetNumberFor.
 */

import { getPendingCountForExercise } from "../src/lib/session/pending-count";
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

console.log("\nTesting getPendingCountForExercise\n");

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

check("Returns 2 for ex-1", getPendingCountForExercise(pending, "ex-1") === 2);
check("Returns 1 for ex-2", getPendingCountForExercise(pending, "ex-2") === 1);
check("Returns 0 for ex-3", getPendingCountForExercise(pending, "ex-3") === 0);
check("Returns 0 for empty pending", getPendingCountForExercise([], "ex-1") === 0);

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
