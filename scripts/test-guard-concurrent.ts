#!/usr/bin/env tsx
/*
 * Test: guardConcurrent prevents triple-tap bugs
 *
 * Tests that three rapid calls (including same-tick calls) result in only one execution.
 */

import { guardConcurrent } from "../src/lib/session/guard-concurrent";

let passed = 0;
let failed = 0;

function testGuard(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqual<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing guardConcurrent\n");

  // Test 1: Single call executes normally
  await testGuard("Single call → executes once", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return callCount;
    };

    const guarded = guardConcurrent(action);
    const result = await guarded();

    assertEqual(result, 1, "Should return result");
    assertEqual(callCount, 1, "Should execute once");
  });

  // Test 2: Three same-tick calls → only first executes
  await testGuard("Triple-tap (same tick) → executes once", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return callCount;
    };

    const guarded = guardConcurrent(action);
    
    // All three calls happen in the same tick (synchronously)
    const p1 = guarded();
    const p2 = guarded(); // Same tick, should be ignored
    const p3 = guarded(); // Same tick, should be ignored

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assertEqual(r1, 1, "First call should succeed with result 1");
    assertEqual(r2, undefined, "Second call should return undefined");
    assertEqual(r3, undefined, "Third call should return undefined");
    assertEqual(callCount, 1, "Action should execute exactly once");
  });

  // Test 3: Three calls within 84ms → only first executes (triple-tap bug scenario)
  await testGuard("Triple-tap (84ms span) → executes once", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 100)); // Longer than 84ms
      return callCount;
    };

    const guarded = guardConcurrent(action);
    
    const p1 = guarded();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const p2 = guarded(); // 40ms later, still in flight
    await new Promise((resolve) => setTimeout(resolve, 44));
    const p3 = guarded(); // 84ms later, still in flight

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assertEqual(r1, 1, "First call should succeed");
    assertEqual(r2, undefined, "Second call should be ignored");
    assertEqual(r3, undefined, "Third call should be ignored");
    assertEqual(callCount, 1, "Action should execute exactly once");
  });

  // Test 4: Sequential calls work fine
  await testGuard("Sequential calls → each executes", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return callCount;
    };

    const guarded = guardConcurrent(action);
    
    const r1 = await guarded();
    const r2 = await guarded(); // After first completes
    const r3 = await guarded(); // After second completes

    assertEqual(r1, 1, "First call returns 1");
    assertEqual(r2, 2, "Second call returns 2");
    assertEqual(r3, 3, "Third call returns 3");
    assertEqual(callCount, 3, "Action executes three times");
  });

  // Test 5: Guard releases even when action throws
  await testGuard("Action throws → guard released", async () => {
    let callCount = 0;
    const action = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Test error");
    };

    const guarded = guardConcurrent(action);
    
    try {
      await guarded();
    } catch (err) {
      // Expected
    }

    // Should be able to call again after error
    try {
      await guarded();
    } catch (err) {
      // Expected
    }

    assertEqual(callCount, 2, "Should execute twice despite errors");
  });

  // Test 6: Multiple guarded functions are independent
  await testGuard("Multiple guarded functions → independent guards", async () => {
    let call1 = 0;
    let call2 = 0;
    
    const action1 = async () => {
      call1++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    
    const action2 = async () => {
      call2++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    };

    const guarded1 = guardConcurrent(action1);
    const guarded2 = guardConcurrent(action2);
    
    // Both can run concurrently
    const p1 = guarded1();
    const p2 = guarded2();

    await Promise.all([p1, p2]);

    assertEqual(call1, 1, "Action 1 should execute");
    assertEqual(call2, 1, "Action 2 should execute");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
