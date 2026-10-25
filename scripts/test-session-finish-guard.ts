#!/usr/bin/env tsx
/**
 * Test: Session finish guard
 * 
 * Behavioral test of pure helper functions that determine
 * whether the session can be finished based on pending set count.
 * 
 * The session-runner uses these to disable the Finish button
 * and show "Saving N sets..." while sets are pending.
 */

import {
  isFinishDisabled,
  getFinishButtonText,
} from "../src/lib/session/finish-guard";

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

console.log("Testing session finish guard\n");

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
