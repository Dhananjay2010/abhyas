#!/usr/bin/env tsx
/**
 * Test save-queue superseded promise handling.
 * 
 * Tests that when an enqueued item is superseded by a newer enqueue,
 * the superseded promise settles so startTransition completes.
 */

import { createSaveQueue, type SupersededResult } from "../src/app/settings/save-queue";
import type { Result } from "../src/app/settings/actions";

let failures = 0;

console.log("Testing save-queue superseded promise handling...\n");

// Test: A superseded enqueue's promise settles
console.log("▶ Test: superseded enqueue promise settles");

const queue = createSaveQueue<Result>();

let request1Executed = false;
let request2Executed = false;
let request3Executed = false;

const request1 = async (): Promise<Result> => {
  await new Promise(resolve => setTimeout(resolve, 50));
  request1Executed = true;
  return { ok: true };
};

const request2 = async (): Promise<Result> => {
  await new Promise(resolve => setTimeout(resolve, 50));
  request2Executed = true;
  return { ok: true };
};

const request3 = async (): Promise<Result> => {
  await new Promise(resolve => setTimeout(resolve, 50));
  request3Executed = true;
  return { ok: true };
};

// Enqueue 3 requests rapidly for the same key
const promise1 = queue.enqueue("test-key", request1);
const promise2 = queue.enqueue("test-key", request2);
const promise3 = queue.enqueue("test-key", request3);

// Wait for all promises to settle
const results = await Promise.allSettled([promise1, promise2, promise3]);

// Check that all promises settled
if (results[0].status === "fulfilled") {
  console.log("  ✓ Promise 1 settled");
} else {
  console.error(`  ❌ Promise 1 did not settle: ${results[0].reason}`);
  failures++;
}

if (results[1].status === "fulfilled") {
  console.log("  ✓ Promise 2 settled");
} else {
  console.error(`  ❌ Promise 2 did not settle: ${results[1].reason}`);
  failures++;
}

if (results[2].status === "fulfilled") {
  console.log("  ✓ Promise 3 settled");
} else {
  console.error(`  ❌ Promise 3 did not settle: ${results[2].reason}`);
  failures++;
}

// Check that superseded promises resolved with { superseded: true }
if (results[0].status === "fulfilled") {
  const value = results[0].value as Result | SupersededResult;
  if (typeof value === "object" && "superseded" in value && value.superseded === true) {
    console.log("  ✓ Promise 1 resolved with { superseded: true }");
  } else {
    console.error(`  ❌ Promise 1 did not resolve with superseded result: ${JSON.stringify(value)}`);
    failures++;
  }
}

if (results[1].status === "fulfilled") {
  const value = results[1].value as Result | SupersededResult;
  if (typeof value === "object" && "superseded" in value && value.superseded === true) {
    console.log("  ✓ Promise 2 resolved with { superseded: true }");
  } else {
    console.error(`  ❌ Promise 2 did not resolve with superseded result: ${JSON.stringify(value)}`);
    failures++;
  }
}

// Check that the last request executed
if (request3Executed) {
  console.log("  ✓ Request 3 executed");
} else {
  console.error("  ❌ Request 3 did not execute");
  failures++;
}

// Check that superseded requests did NOT execute
if (!request1Executed) {
  console.log("  ✓ Request 1 did not execute (superseded)");
} else {
  console.error("  ❌ Request 1 should not have executed");
  failures++;
}

if (!request2Executed) {
  console.log("  ✓ Request 2 did not execute (superseded)");
} else {
  console.error("  ❌ Request 2 should not have executed");
  failures++;
}

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
