#!/usr/bin/env tsx
/**
 * Test: Pending UI state helpers
 * 
 * Behavioral test of pure helpers that map pending set state to UI display mode.
 * 
 * The session-runner uses these to decide whether to show:
 * - "Failed to save sets" + error message (replay-error mode)
 * - SessionExpiredPrompt (expired mode)
 * - Nothing (none mode)
 */

import { getPendingUiMode, getReplayErrorMessage } from "../src/lib/session/pending-ui-state";
import type { PendingSetState } from "../src/lib/session/pending-set-controller";

let exitCode = 0;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing pending UI state helpers\n");

// No pending sets -> none mode
const noPending: PendingSetState = {
  pending: [],
  expired: false,
  retrying: false,
  error: null,
  replayed: [],
};
assertEqual(getPendingUiMode(noPending), "none", "No pending sets -> none mode");
assertEqual(getReplayErrorMessage(noPending), null, "No error message when no pending");

// Pending + error -> replay-error mode (NOT expired)
const withError: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: true,
  retrying: false,
  error: "Network timeout",
  replayed: [],
};
assertEqual(getPendingUiMode(withError), "replay-error", "Pending + error -> replay-error mode");
assertEqual(getReplayErrorMessage(withError), "Network timeout", "Error message extracted correctly");

// Pending without error -> expired mode
const withoutError: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: true,
  retrying: false,
  error: null,
  replayed: [],
};
assertEqual(getPendingUiMode(withoutError), "expired", "Pending without error -> expired mode");
assertEqual(getReplayErrorMessage(withoutError), null, "No error message in expired mode");

// Pending + retrying + no error -> expired mode
const retrying: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: true,
  retrying: true,
  error: null,
  replayed: [],
};
assertEqual(getPendingUiMode(retrying), "expired", "Retrying without error -> expired mode");

// Multiple pending + error -> replay-error mode
const multipleWithError: PendingSetState = {
  pending: [
    { sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" },
    { sessionExerciseId: "ex1", setNumber: 2, reps: 12, weightKg: 50, durationSeconds: null, clientId: "c2" },
  ],
  expired: true,
  retrying: false,
  error: "Server error",
  replayed: [],
};
assertEqual(getPendingUiMode(multipleWithError), "replay-error", "Multiple pending + error -> replay-error mode");
assertEqual(getReplayErrorMessage(multipleWithError), "Server error", "Error message for multiple pending");

console.log(exitCode === 0 ? "\n✅ All pending UI state tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
