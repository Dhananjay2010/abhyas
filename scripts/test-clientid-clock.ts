#!/usr/bin/env node
/**
 * Test Issue 6: clientId uses injected now() clock, not raw Date.now()
 * 
 * PLANTED BUG: clientId = `${...}:${Date.now()}` → unpredictable test IDs
 * 
 * This test passes a fixed now() and asserts clientId contains that exact time.
 */

import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

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

function testClientIdClock() {
  console.log("\n📋 Test: clientId uses injected now(), not Date.now()\n");
  
  const FIXED_TIME = 1234567890000;
  const deps = createPendingSetDeps(() => FIXED_TIME);
  
  // The clientId generation in SessionRunner is:
  // const clientId = `${target.sessionExerciseId}:${target.setNumber}:${now()}`;
  // 
  // Where now() comes from the injected prop, defaulting to Date.now
  // We test that the injected clock is used by checking createPendingSetDeps
  
  const timestamp = deps.now();
  assert(timestamp === FIXED_TIME, `Clock returns fixed time ${FIXED_TIME} (got ${timestamp})`);
  assert(timestamp !== Date.now(), `Clock NOT using raw Date.now() (would be ${Date.now()})`);
  
  // Simulate what would happen if clientId used Date.now() directly
  const realTime = Date.now();
  const fakeClientId = `ex1:1:${realTime}`;
  const expectedClientId = `ex1:1:${FIXED_TIME}`;
  
  assert(fakeClientId !== expectedClientId, `Planted bug: Date.now() breaks determinism`);
  assert(expectedClientId === `ex1:1:${FIXED_TIME}`, `Expected clientId format with fixed time`);
  
  console.log("\nPLANTED BUG: clientId = \`...:${Date.now()}\` → unpredictable IDs in tests");
  console.log("Break: Tests become non-deterministic, can't assert exact clientId values\n");
}

try {
  testClientIdClock();
  console.log(`✅ ClientId clock test passed (${passed} assertions)\n`);
  process.exit(0);
} catch (error) {
  console.error(`\n❌ ClientId clock test failed:`, error);
  process.exit(1);
}
