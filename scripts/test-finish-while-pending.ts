#!/usr/bin/env tsx
/**
 * Test: Finish button disabled while sets are pending
 * 
 * Verifies that:
 * - canFinishSession returns false when pending sets exist
 * - canFinishSession returns true when no pending sets
 * - Pure helper function for runner to use
 */

let exitCode = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

/**
 * Pure helper: can the session be finished?
 * Returns false if there are pending sets waiting to save.
 */
function canFinishSession(pendingCount: number): boolean {
  return pendingCount === 0;
}

console.log("Testing finish-while-pending guard\n");

// No pending sets - can finish
const canFinish1 = canFinishSession(0);
assertEqual(canFinish1, true, "Can finish when no pending sets");

// One pending set - cannot finish
const canFinish2 = canFinishSession(1);
assertEqual(canFinish2, false, "Cannot finish with 1 pending set");

// Multiple pending sets - cannot finish
const canFinish3 = canFinishSession(3);
assertEqual(canFinish3, false, "Cannot finish with 3 pending sets");

// Back to zero - can finish again
const canFinish4 = canFinishSession(0);
assertEqual(canFinish4, true, "Can finish after sets are saved");

// Test button state derivation
interface PendingSetState {
  pending: Array<{ clientId: string }>;
}

function shouldDisableFinish(pending: PendingSetState, busy: boolean): boolean {
  return busy || pending.pending.length > 0;
}

function getFinishButtonText(pending: PendingSetState): string {
  if (pending.pending.length > 0) {
    const count = pending.pending.length;
    return `Saving ${count} ${count === 1 ? "set" : "sets"}…`;
  }
  return "Done";
}

// No pending sets, not busy
const disabled1 = shouldDisableFinish({ pending: [] }, false);
assertEqual(disabled1, false, "Button enabled when no pending sets and not busy");
assertEqual(getFinishButtonText({ pending: [] }), "Done", "Shows 'Done' when no pending");

// Pending sets exist
const disabled2 = shouldDisableFinish({ pending: [{ clientId: "c1" }] }, false);
assertEqual(disabled2, true, "Button disabled when pending sets exist");
assertEqual(getFinishButtonText({ pending: [{ clientId: "c1" }] }), "Saving 1 set…", "Shows saving message for 1 set");

// Multiple pending sets
const disabled3 = shouldDisableFinish({ pending: [{ clientId: "c1" }, { clientId: "c2" }] }, false);
assertEqual(disabled3, true, "Button disabled with multiple pending sets");
assertEqual(getFinishButtonText({ pending: [{ clientId: "c1" }, { clientId: "c2" }] }), "Saving 2 sets…", "Shows saving message for 2 sets");

// Busy takes precedence
const disabled4 = shouldDisableFinish({ pending: [] }, true);
assertEqual(disabled4, true, "Button disabled when busy even with no pending");

console.log(exitCode === 0 ? "\n✅ All finish-while-pending tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
