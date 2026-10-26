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
  conflicts: 0,
};
assertEqual(getPendingUiMode(noPending), "none", "No pending sets -> none mode");
assertEqual(getReplayErrorMessage(noPending), null, "No error message when no pending");

// Pending + error -> expired mode (expired takes priority)
const withError: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: true,
  retrying: false,
  error: "Network timeout",
  replayed: [],
  conflicts: 0,
};
assertEqual(getPendingUiMode(withError), "expired", "Pending + expired + error -> expired mode (keeps sign-in visible)");
assertEqual(getReplayErrorMessage(withError), null, "No error message shown in expired mode");

// Pending + error but not expired -> replay-error mode
const errorNotExpired: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: false,
  retrying: false,
  error: "Network error",
  replayed: [],
  conflicts: 0,
};
assertEqual(getPendingUiMode(errorNotExpired), "replay-error", "Pending + error but not expired -> replay-error mode");
assertEqual(getReplayErrorMessage(errorNotExpired), "Network error", "Error message extracted when not expired");

// Pending without error -> expired mode
const withoutError: PendingSetState = {
  pending: [{ sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" }],
  expired: true,
  retrying: false,
  error: null,
  replayed: [],
  conflicts: 0,
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
  conflicts: 0,
};
assertEqual(getPendingUiMode(retrying), "expired", "Retrying without error -> expired mode");

// Multiple pending + expired + error -> expired mode (expired priority)
const multipleWithError: PendingSetState = {
  pending: [
    { sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "c1" },
    { sessionExerciseId: "ex1", setNumber: 2, reps: 12, weightKg: 50, durationSeconds: null, clientId: "c2" },
  ],
  expired: true,
  retrying: false,
  error: "Server error",
  replayed: [],
  conflicts: 0,
};
assertEqual(getPendingUiMode(multipleWithError), "expired", "Multiple pending + expired + error -> expired mode");
assertEqual(getReplayErrorMessage(multipleWithError), null, "No error message shown when expired");

console.log(exitCode === 0 ? "\n✅ All pending UI state tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
