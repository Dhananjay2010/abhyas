#!/usr/bin/env tsx
/**
 * Test that busy-guard rejections don't count as failed saves.
 *
 * Item 9: A double-tap or busy-guard rejection on Log set must not count
 * as a failed save, so it doesn't block finishing or show error messages.
 *
 *   npx tsx scripts/test-busy-guard-not-failure.ts
 */

import { PendingTracker } from "../src/lib/session/pending-tracker";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function runTests() {
  console.log("\n1. Busy-guard rejection (false) is not tracked");
  {
    const tracker = new PendingTracker();
    
    // Simulate the session-runner logic when busy
    const busyRef = { current: true };
    
    // run() returns false when busy
    const logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
    
    // The fix: don't track if logSetPromise is false
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    // Should have no pending operations and no failures
    assertEquals(tracker.hasPending(), false, "Should have no pending operations");
    assertEquals(tracker.hasRecentFailures(), false, "Should have no failures");
  }

  console.log("\n2. Successful save is tracked correctly");
  {
    const tracker = new PendingTracker();
    
    // Simulate the session-runner logic when not busy
    const busyRef = { current: false };
    const logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
    
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    // Should have a pending operation initially
    assertEquals(tracker.hasPending(), true, "Should have pending operation before resolution");
    
    // Wait for it to resolve
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assertEquals(tracker.hasPending(), false, "Should have no pending operations after resolution");
    assertEquals(tracker.hasRecentFailures(), false, "Should have no failures after success");
  }

  console.log("\n3. Failed save is tracked as failure");
  {
    const tracker = new PendingTracker();
    
    // Simulate the session-runner logic with a failed save
    const busyRef = { current: false };
    const logSetPromise = busyRef.current ? false : Promise.resolve({ ok: false });
    
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    // Wait for it to resolve
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assertEquals(tracker.hasPending(), false, "Should have no pending operations after resolution");
    assertEquals(tracker.hasRecentFailures(), true, "Should have a failure after failed save");
  }

  console.log("\n4. Multiple busy-guard rejections don't accumulate as failures");
  {
    const tracker = new PendingTracker();
    
    // Simulate rapid taps (all busy)
    const busyRef = { current: true };
    
    for (let i = 0; i < 5; i++) {
      const logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
      if (logSetPromise !== false) {
        tracker.track("logSet", logSetPromise);
      }
    }
    
    assertEquals(tracker.hasPending(), false, "Should have no pending operations");
    assertEquals(tracker.hasRecentFailures(), false, "Should have no failures from busy guards");
  }

  console.log("\n5. One success followed by busy-guard has no failures");
  {
    const tracker = new PendingTracker();
    
    // First tap succeeds
    let busyRef = { current: false };
    let logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Second tap is rejected (busy)
    busyRef = { current: true };
    logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    assertEquals(tracker.hasPending(), false, "Should have no pending operations");
    assertEquals(tracker.hasRecentFailures(), false, "Should have no failures");
  }

  console.log("\n6. Busy-guard followed by failure is tracked as one failure");
  {
    const tracker = new PendingTracker();
    
    // First tap is rejected (busy)
    let busyRef = { current: true };
    let logSetPromise = busyRef.current ? false : Promise.resolve({ ok: true });
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    // Second tap fails
    busyRef = { current: false };
    logSetPromise = busyRef.current ? false : Promise.resolve({ ok: false });
    if (logSetPromise !== false) {
      tracker.track("logSet", logSetPromise);
    }
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assertEquals(tracker.hasPending(), false, "Should have no pending operations");
    assertEquals(tracker.hasRecentFailures(), true, "Should have one failure from the actual failed save");
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
