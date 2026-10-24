#!/usr/bin/env tsx
/**
 * Test: Session finish guard
 * 
 * Behavioral test of a pure helper function that determines
 * whether the session can be finished based on pending set count.
 * 
 * The session-runner uses this to disable the Finish button
 * and show "Saving N sets..." while sets are pending.
 */

let exitCode = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

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

/**
 * Pure helper: Can the session be finished?
 * Returns false if there are pending sets waiting to save.
 */
export function canFinishSession(pendingCount: number): boolean {
  return pendingCount === 0;
}

/**
 * Derive finish button disabled state from pending sets and busy flag.
 */
export function isFinishDisabled(pendingCount: number, busy: boolean): boolean {
  return busy || pendingCount > 0;
}

/**
 * Get finish button text based on pending sets.
 */
export function getFinishButtonText(pendingCount: number): string {
  if (pendingCount > 0) {
    return `Saving ${pendingCount} ${pendingCount === 1 ? "set" : "sets"}…`;
  }
  return "Done";
}

console.log("Testing session finish guard\n");

// canFinishSession tests
assertEqual(canFinishSession(0), true, "Can finish when no pending sets");
assertEqual(canFinishSession(1), false, "Cannot finish with 1 pending set");
assertEqual(canFinishSession(3), false, "Cannot finish with 3 pending sets");
assertEqual(canFinishSession(10), false, "Cannot finish with 10 pending sets");

// isFinishDisabled tests
assertEqual(isFinishDisabled(0, false), false, "Button enabled when no pending and not busy");
assertEqual(isFinishDisabled(1, false), true, "Button disabled when 1 pending set");
assertEqual(isFinishDisabled(0, true), true, "Button disabled when busy even with no pending");
assertEqual(isFinishDisabled(2, true), true, "Button disabled when busy and pending");

// getFinishButtonText tests
assertEqual(getFinishButtonText(0), "Done", "Shows 'Done' when no pending");
assertEqual(getFinishButtonText(1), "Saving 1 set…", "Shows 'Saving 1 set…' for 1 pending");
assertEqual(getFinishButtonText(2), "Saving 2 sets…", "Shows 'Saving 2 sets…' for 2 pending");
assertEqual(getFinishButtonText(5), "Saving 5 sets…", "Shows 'Saving 5 sets…' for 5 pending");

console.log(exitCode === 0 ? "\n✅ All finish guard tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
