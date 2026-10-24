export {};
/**
 * Serial queue test.
 *
 * Verifies:
 * 1. Operations execute in order
 * 2. Operations are serialized (one at a time)
 * 3. Failures are tolerated (queue continues)
 * 4. Pending count returns to 0 after all operations complete
 *
 *   npx tsx scripts/test-serial-queue.ts
 */

import { createSerialQueue } from "../src/lib/serial-queue";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("\n1. Operations execute in order");
  {
    const queue = createSerialQueue();
    const results: number[] = [];
    
    queue.enqueue(async () => {
      await delay(10);
      results.push(1);
    });
    queue.enqueue(async () => {
      await delay(5);
      results.push(2);
    });
    queue.enqueue(async () => {
      results.push(3);
    });
    
    await delay(50);
    check("operations ran in order", JSON.stringify(results) === "[1,2,3]", JSON.stringify(results));
  }

  console.log("\n2. Operations are serialized (one at a time)");
  {
    const queue = createSerialQueue();
    let running = 0;
    let maxConcurrent = 0;
    
    async function operation() {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await delay(10);
      running--;
    }
    
    queue.enqueue(() => operation());
    queue.enqueue(() => operation());
    queue.enqueue(() => operation());
    
    await delay(50);
    check("never more than 1 operation running", maxConcurrent === 1, `max concurrent: ${maxConcurrent}`);
  }

  console.log("\n3. Failures are tolerated");
  {
    const queue = createSerialQueue();
    const results: string[] = [];
    
    queue.enqueue(async () => {
      results.push("op1");
    });
    
    queue.enqueue(async () => {
      results.push("op2-before-error");
      throw new Error("Intentional test failure");
    }).catch(() => {
      results.push("op2-caught");
    });
    
    queue.enqueue(async () => {
      results.push("op3");
    });
    
    await delay(50);
    check("op1 ran", results.includes("op1"));
    check("op2 ran and threw", results.includes("op2-before-error"));
    check("op2 error was catchable", results.includes("op2-caught"));
    check("op3 ran after failure", results.includes("op3"));
  }

  console.log("\n4. Pending count returns to 0");
  {
    const queue = createSerialQueue();
    
    check("pending starts at 0", queue.pending() === 0, `pending: ${queue.pending()}`);
    
    queue.enqueue(async () => {
      await delay(10);
    });
    queue.enqueue(async () => {
      await delay(10);
    });
    
    const duringPending = queue.pending();
    check("pending increases during operations", duringPending === 2, `pending: ${duringPending}`);
    
    await delay(50);
    check("pending returns to 0 after completion", queue.pending() === 0, `pending: ${queue.pending()}`);
  }

  console.log("\n5. Pending count returns to 0 even after failures");
  {
    const queue = createSerialQueue();
    
    queue.enqueue(async () => {
      await delay(5);
    });
    
    queue.enqueue(async () => {
      await delay(5);
      throw new Error("Test error");
    }).catch(() => {
      // Swallow for test
    });
    
    queue.enqueue(async () => {
      await delay(5);
    });
    
    await delay(50);
    check("pending returns to 0 after mixed success/failure", queue.pending() === 0, `pending: ${queue.pending()}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

runTests();
