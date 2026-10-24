#!/usr/bin/env node
/**
 * Unit test: createSaveOnce behavioral tests
 *
 * Tests the save-once guard helper used in breathing practice saves:
 * - Two concurrent calls run fn once and return the same promise
 * - After a failure, a new call runs again with the same arguments
 * - After success, a call is a no-op
 */

import { createSaveOnce } from "../src/lib/breathe/save-once";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`
  );
}

async function runTests() {
  console.log("\n1. Two concurrent calls run fn once");
  {
    let callCount = 0;
    const save = createSaveOnce(async (logId: string) => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: true, logId };
    });

    const promise1 = save("log-123");
    const promise2 = save("log-123");

    check("both calls return a promise", promise1 instanceof Promise && promise2 instanceof Promise);
    check("both calls return the SAME promise", promise1 === promise2);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    check("fn called exactly once", callCount === 1, `callCount=${callCount}`);
    check("first call resolved correctly", result1.ok && result1.logId === "log-123");
    check("second call got same result", result2.ok && result2.logId === "log-123");
  }

  console.log("\n2. After failure, a new call runs again");
  {
    let callCount = 0;
    const save = createSaveOnce(async (logId: string) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network error");
      }
      return { ok: true, logId };
    });

    let firstError: Error | null = null;
    try {
      await save("log-456");
    } catch (e) {
      firstError = e as Error;
    }

    check("first call threw error", firstError?.message === "Network error");
    check("fn was called once", callCount === 1);

    // Retry after failure
    const retryResult = await save("log-456");

    check("fn called again after failure", callCount === 2, `callCount=${callCount}`);
    check("retry succeeded", retryResult.ok && retryResult.logId === "log-456");
  }

  console.log("\n3. After success, a call is a no-op");
  {
    let callCount = 0;
    const save = createSaveOnce(async (logId: string) => {
      callCount++;
      return { ok: true, logId };
    });

    const firstResult = await save("log-789");
    check("first call succeeded", firstResult.ok && firstResult.logId === "log-789");
    check("fn called once", callCount === 1);

    const secondResult = await save("log-789");
    check("second call after success is a no-op", secondResult === undefined);
    check("fn NOT called again", callCount === 1, `callCount=${callCount}`);
  }

  console.log("\n4. Concurrent calls during failure clear in-flight state");
  {
    let callCount = 0;
    let shouldFail = true;
    const save = createSaveOnce(async (logId: string) => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (shouldFail) {
        throw new Error("Temporary failure");
      }
      return { ok: true, logId };
    });

    const promise1 = save("log-concurrent");
    const promise2 = save("log-concurrent");

    check("concurrent calls return same promise during failure", promise1 === promise2);

    let error1: Error | null = null;
    let error2: Error | null = null;
    try {
      await promise1;
    } catch (e) {
      error1 = e as Error;
    }
    try {
      await promise2;
    } catch (e) {
      error2 = e as Error;
    }

    check("both calls failed", !!(error1 && error2));
    check("fn called once during concurrent failure", callCount === 1, `callCount=${callCount}`);

    // After failure clears, retry should work
    shouldFail = false;
    const retryResult = await save("log-concurrent");
    check("retry after concurrent failure succeeded", retryResult.ok);
    check("fn called again after failure cleared", callCount === 2, `callCount=${callCount}`);
  }
}

runTests()
  .then(() => {
    if (failures === 0) {
      console.log("\n✅ All createSaveOnce tests passed\n");
      process.exit(0);
    } else {
      console.log(`\n❌ ${failures} test(s) failed\n`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n❌ Test harness error:", error);
    process.exit(1);
  });
