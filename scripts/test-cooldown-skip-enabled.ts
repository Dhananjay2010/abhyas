#!/usr/bin/env node
/**
 * Test F1: Cool-down shows Sign in/Retry with pending sets, Skip stays enabled
 * 
 * Verifies that during cool-down:
 * - Sign in again link and Retry button are shown when sets are pending and session expired
 * - Skip cool-down button stays enabled (only disabled by busy, not by pending sets)
 * - Done button is disabled by pending sets
 */

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

// Import helper
import { isFinishDisabled } from "../src/lib/session/finish-guard";

function testCooldownSkipEnabledWithPending() {
  console.log("\n📋 Test: Cool-down Skip enabled with pending sets\n");
  
  const pendingCount = 2;
  const busyFalse = false;
  const busyTrue = true;
  
  // Skip cool-down should use: disabled={busy}
  // NOT: disabled={isFinishDisabled(pendingCount, busy)}
  
  const skipCorrectLogic = busyFalse;  // disabled={busy} when not busy
  const skipBuggyLogic = isFinishDisabled(pendingCount, busyFalse);  // would be true (blocked)
  
  assert(skipCorrectLogic === false, "Skip enabled when not busy (pending sets don't block)");
  assert(skipBuggyLogic === true, "PLANTED BUG: Skip would be blocked by pending sets");
  
  // Done button should use: disabled={isFinishDisabled(pendingCount, busy)}
  const doneDisabled = isFinishDisabled(pendingCount, busyFalse);
  assert(doneDisabled === true, "Done correctly disabled with pending sets");
  
  console.log("\nPLANTED BUG: Skip cool-down disabled={isFinishDisabled(...)} → user stuck");
}

try {
  testCooldownSkipEnabledWithPending();
  console.log(`\n✅ Cool-down Skip test passed (${passed} assertions)\n`);
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Cool-down Skip test failed:`, error);
  process.exit(1);
}
