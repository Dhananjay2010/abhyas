#!/usr/bin/env tsx
/*
 * Test: Concurrent guard (busyRef lock)
 *
 * Tests that createConcurrentGuard ensures two concurrent calls produce exactly ONE execution.
 * This prevents double-tap issues where two rapid button presses would trigger two server writes.
 *
 * Regression: If busyRef lock is removed, both calls execute and produce TWO writes.
 */

import { createConcurrentGuard } from "../src/lib/session/guard-concurrent";

export {}; // Make this a module

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
  console.log("Testing concurrent guard (busyRef lock)\n");

  // Test 1: Single call executes normally
  await testGuard("Single call executes and returns result", async () => {
    let executions = 0;
    const busyRef = { current: false };

    const guarded = createConcurrentGuard(async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "success";
    }, busyRef);

    const result = await guarded();

    assertEqual(result, "success", "Should return the result");
    assertEqual(executions, 1, "Should execute exactly once");
    assertEqual(busyRef.current, false, "busyRef should be reset after completion");
  });

  // Test 2: Concurrent calls - only first one executes
  await testGuard("Two concurrent calls produce exactly ONE execution", async () => {
    let executions = 0;
    const busyRef = { current: false };

    const guarded = createConcurrentGuard(async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "success";
    }, busyRef);

    // Launch two calls concurrently (simulating double-tap)
    const [result1, result2] = await Promise.all([guarded(), guarded()]);

    // First call should succeed, second should be rejected
    assertEqual(executions, 1, "Should execute exactly ONCE, not twice");
    assertEqual(result1, "success", "First call should succeed");
    assertEqual(result2, undefined, "Second call should be rejected (return undefined)");
    assertEqual(busyRef.current, false, "busyRef should be reset after completion");
  });

  // Test 3: Sequential calls both execute
  await testGuard("Sequential calls both execute", async () => {
    let executions = 0;
    const busyRef = { current: false };

    const guarded = createConcurrentGuard(async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return `result-${executions}`;
    }, busyRef);

    const result1 = await guarded();
    const result2 = await guarded();

    assertEqual(executions, 2, "Should execute twice (sequential)");
    assertEqual(result1, "result-1", "First call should succeed");
    assertEqual(result2, "result-2", "Second call should succeed");
    assertEqual(busyRef.current, false, "busyRef should be reset");
  });

  // Test 4: busyRef is reset even if function throws
  await testGuard("busyRef reset even on error", async () => {
    let executions = 0;
    const busyRef = { current: false };

    const guarded = createConcurrentGuard(async () => {
      executions++;
      throw new Error("test error");
    }, busyRef);

    try {
      await guarded();
    } catch {
      // Expected to throw
    }

    assertEqual(executions, 1, "Should execute once");
    assertEqual(busyRef.current, false, "busyRef should be reset even on error");

    // Second call should succeed (not blocked by first error)
    try {
      await guarded();
    } catch {
      // Expected to throw
    }

    assertEqual(executions, 2, "Should allow second call after first error");
  });

  // Test 5: Three rapid concurrent calls - only first succeeds
  await testGuard("Three rapid concurrent calls - only first succeeds", async () => {
    let executions = 0;
    const busyRef = { current: false };

    const guarded = createConcurrentGuard(async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "success";
    }, busyRef);

    // Launch three calls concurrently
    const [result1, result2, result3] = await Promise.all([guarded(), guarded(), guarded()]);

    assertEqual(executions, 1, "Should execute exactly once");
    assertEqual(result1, "success", "First call should succeed");
    assertEqual(result2, undefined, "Second call should be rejected");
    assertEqual(result3, undefined, "Third call should be rejected");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
