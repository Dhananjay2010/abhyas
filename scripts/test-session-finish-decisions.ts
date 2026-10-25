#!/usr/bin/env tsx
/**
 * Test: Session finish decision helpers
 * 
 * Tests breaks N11 and N12:
 * - N11: Cool-down guard when cool-down is off
 * - N12: End early button disabled while pending
 */

import { shouldShowCooldownForPending, isEndEarlyDisabled } from "../src/lib/session/session-finish-decisions";

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting session finish decisions\n");

// Test shouldShowCooldownForPending (N11)
console.log("--- shouldShowCooldownForPending (N11) ---");
check(
  "Cool-down on: don't show cooldown for pending",
  shouldShowCooldownForPending(true, 1) === false
);
check(
  "Cool-down off, no pending: don't show cooldown",
  shouldShowCooldownForPending(false, 0) === false
);
check(
  "Cool-down off, 1 pending: show cooldown",
  shouldShowCooldownForPending(false, 1) === true
);
check(
  "Cool-down off, 3 pending: show cooldown",
  shouldShowCooldownForPending(false, 3) === true
);

// Test isEndEarlyDisabled (N12)
console.log("\n--- isEndEarlyDisabled (N12) ---");
check(
  "Not busy, no pending: enabled",
  isEndEarlyDisabled(false, 0) === false
);
check(
  "Busy, no pending: disabled",
  isEndEarlyDisabled(true, 0) === true
);
check(
  "Not busy, 1 pending: disabled",
  isEndEarlyDisabled(false, 1) === true
);
check(
  "Busy, 1 pending: disabled",
  isEndEarlyDisabled(true, 1) === true
);

console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
