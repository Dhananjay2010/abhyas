#!/usr/bin/env tsx
/**
 * Test the withBusyGuard helper.
 *
 *   npx tsx scripts/test-busy-guard.ts
 */

import { withBusyGuard } from "../src/lib/session/busy-guard";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

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

(async () => {
  console.log("\nTesting withBusyGuard helper\n");

  console.log("1. Not busy: executes function and returns result");
  {
    let busy = false;
    const result = await withBusyGuard(
      () => busy,
      (b) => { busy = b; },
      async () => ({ ok: true, value: 42 })
    );

    assertTrue(!result.busy, "Result is not busy");
    if (!result.busy) {
      assertEquals(result.result.ok, true, "Result.ok is true");
      assertEquals(result.result.value, 42, "Result.value is 42");
    }
    assertTrue(!busy, "Busy flag is reset after completion");
  }

  console.log("\n2. Already busy: returns busy without executing function");
  {
    let busy = true;
    let executed = false;
    
    const result = await withBusyGuard(
      () => busy,
      (b) => { busy = b; },
      async () => {
        executed = true;
        return { ok: true };
      }
    );

    assertTrue(result.busy, "Result indicates busy");
    assertTrue(!executed, "Function was not executed");
    assertTrue(busy, "Busy flag remains true");
  }

  console.log("\n3. Concurrent calls: second call returns busy");
  {
    let busy = false;
    let firstStarted = false;
    let firstFinished = false;
    let secondResult: Awaited<ReturnType<typeof withBusyGuard<{ ok: boolean }>>> | null = null;

    const firstCall = withBusyGuard(
      () => busy,
      (b) => { busy = b; },
      async () => {
        firstStarted = true;
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));
        firstFinished = true;
        return { ok: true };
      }
    );

    // Wait a bit for first call to start
    await new Promise(resolve => setTimeout(resolve, 10));

    // Try second call while first is in flight
    secondResult = await withBusyGuard(
      () => busy,
      (b) => { busy = b; },
      async () => ({ ok: false })
    );

    await firstCall;

    assertTrue(firstStarted, "First call started");
    assertTrue(firstFinished, "First call finished");
    assertTrue(secondResult.busy, "Second call returned busy");
    assertTrue(!busy, "Busy flag is reset after first call completes");
  }

  console.log("\n4. Function throws: busy flag is still reset");
  {
    let busy = false;
    
    try {
      await withBusyGuard(
        () => busy,
        (b) => { busy = b; },
        async () => {
          throw new Error("Test error");
        }
      );
      console.error("❌ Expected error to be thrown");
      failed++;
    } catch (err) {
      assertTrue(err instanceof Error && err.message === "Test error", "Error was thrown");
      assertTrue(!busy, "Busy flag is reset even after error");
    }
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All busy-guard tests passed!");
})();
