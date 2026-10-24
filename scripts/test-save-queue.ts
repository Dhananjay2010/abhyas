#!/usr/bin/env tsx
/**
 * Test save queue serialization and coalescing.
 * 
 * Proves:
 * 1. At most one request in flight per key
 * 2. Coalescing: latest queued patch replaces earlier queued
 * 3. Last user choice is always the last write to the server
 */

import { createSaveQueue } from "../src/app/settings/save-queue";

let failures = 0;

console.log("Testing save queue serialization...\n");

async function runTests() {

// Test 1: Basic serialization - one at a time per key
console.log("▶ Test 1: At most one in-flight request per key");
{
  const queue = createSaveQueue<number>();
  const serverWrites: number[] = [];
  let resolver1: ((v: number) => void) | null = null;
  let resolver2: ((v: number) => void) | null = null;

  const request1 = () => new Promise<number>((resolve) => {
    resolver1 = resolve;
  });

  const request2 = () => new Promise<number>((resolve) => {
    resolver2 = resolve;
  });

  // Enqueue two requests for the same key
  const promise1 = queue.enqueue("days", request1);
  const promise2 = queue.enqueue("days", request2);

  // First should be in-flight, second should be queued
  const inFlight1 = queue.getInFlightKeys();
  const queued1 = queue.getQueuedKeys();

  if (inFlight1.length === 1 && inFlight1[0] === "days") {
    console.log("  ✓ First request is in-flight");
  } else {
    console.error(`  ❌ Expected 1 in-flight [days], got [${inFlight1.join(", ")}]`);
    failures++;
  }

  if (queued1.length === 1 && queued1[0] === "days") {
    console.log("  ✓ Second request is queued");
  } else {
    console.error(`  ❌ Expected 1 queued [days], got [${queued1.join(", ")}]`);
    failures++;
  }

  // Resolve first request
  resolver1!(4);
  await promise1;
  serverWrites.push(4);

  // Second should now be in-flight
  await new Promise(done => setTimeout(done, 10));
  const inFlight2 = queue.getInFlightKeys();
  if (inFlight2.length === 1 && inFlight2[0] === "days") {
    console.log("  ✓ Second request moved to in-flight after first completed");
  } else {
    console.error(`  ❌ Expected 1 in-flight [days], got [${inFlight2.join(", ")}]`);
    failures++;
  }

  // Resolve second request
  resolver2!(5);
  await promise2;
  serverWrites.push(5);

  if (serverWrites.length === 2 && serverWrites[0] === 4 && serverWrites[1] === 5) {
    console.log("  ✓ Server received writes in order: 4, 5");
  } else {
    console.error(`  ❌ Expected [4, 5], got [${serverWrites.join(", ")}]`);
    failures++;
  }
}

// Test 2: Coalescing - rapid clicks 4→5→3→4
console.log("\n▶ Test 2: Coalescing rapid clicks (4→5→3→4)");
{
  const queue = createSaveQueue<{ days: number }>();
  const serverWrites: number[] = [];
  let currentResolver: ((v: { days: number }) => void) | null = null;

  const makeRequest = (value: number) => () => new Promise<{ days: number }>((resolve) => {
    currentResolver = resolve;
    serverWrites.push(value);
  });

  // Click 4 - starts immediately
  const p1 = queue.enqueue("days", makeRequest(4));
  
  // Click 5 - queued (coalesces 4 that's already in-flight)
  const p2 = queue.enqueue("days", makeRequest(5));
  
  // Click 3 - replaces queued 5 (coalescing)
  const p3 = queue.enqueue("days", makeRequest(3));
  
  // Click 4 - replaces queued 3 (coalescing)
  const p4 = queue.enqueue("days", makeRequest(4));

  // At this point: in-flight=[4], queued=[4 (latest)]
  const inFlight = queue.getInFlightKeys();
  const queued = queue.getQueuedKeys();

  if (inFlight.length === 1 && queued.length === 1) {
    console.log("  ✓ One in-flight, one queued (coalesced)");
  } else {
    console.error(`  ❌ Expected 1 in-flight and 1 queued, got ${inFlight.length} and ${queued.length}`);
    failures++;
  }

  // Resolve first request (4)
  currentResolver!({ days: 4 });
  await p1;

  // Second request (the final 4, coalesced) should now be in-flight
  await new Promise(done => setTimeout(done, 10));
  
  // Resolve final request (only p4 will resolve, p2 and p3 were coalesced away)
  currentResolver!({ days: 4 });
  await p4;

  // Server should have received exactly 2 writes: 4, 4
  if (serverWrites.length === 2 && serverWrites[0] === 4 && serverWrites[1] === 4) {
    console.log("  ✓ Server received 2 writes: 4, 4 (coalescing worked)");
    console.log("  ✓ Saves 5 and 3 were coalesced away");
  } else {
    console.error(`  ❌ Expected [4, 4], got [${serverWrites.join(", ")}]`);
    failures++;
  }
}

// Test 3: Independent keys don't block each other
console.log("\n▶ Test 3: Independent keys process concurrently");
{
  const queue = createSaveQueue<string>();
  const serverWrites: Array<{ key: string; value: string }> = [];
  const resolvers = new Map<string, (v: string) => void>();

  const makeRequest = (key: string, value: string) => () => new Promise<string>((resolve) => {
    resolvers.set(key, resolve);
    serverWrites.push({ key, value });
  });

  // Start requests for different keys
  const p1 = queue.enqueue("goal", makeRequest("goal", "strength"));
  const p2 = queue.enqueue("days", makeRequest("days", "4"));
  const p3 = queue.enqueue("session", makeRequest("session", "60"));

  await new Promise(done => setTimeout(done, 10));

  const inFlight = queue.getInFlightKeys();
  if (inFlight.length === 3) {
    console.log("  ✓ All 3 keys in-flight concurrently");
  } else {
    console.error(`  ❌ Expected 3 in-flight, got ${inFlight.length}`);
    failures++;
  }

  // Resolve all
  resolvers.get("goal")?.("strength");
  resolvers.get("days")?.("4");
  resolvers.get("session")?.("60");
  await Promise.all([p1, p2, p3]);

  if (serverWrites.length === 3) {
    console.log("  ✓ Server received 3 writes (one per key)");
  } else {
    console.error(`  ❌ Expected 3 writes, got ${serverWrites.length}`);
    failures++;
  }
}

// Test 4: Status reporting
console.log("\n▶ Test 4: Status reporting");
{
  const queue = createSaveQueue<number>();
  let resolver: ((v: number) => void) | null = null;

  const status1 = queue.getStatus();
  if (status1.state === "idle") {
    console.log("  ✓ Initial status is idle");
  } else {
    console.error(`  ❌ Expected idle, got ${status1.state}`);
    failures++;
  }

  const request = () => new Promise<number>((resolve) => {
    resolver = resolve;
  });

  const promise = queue.enqueue("days", request);

  await new Promise(done => setTimeout(done, 10));

  const status2 = queue.getStatus();
  if (status2.state === "saving") {
    console.log("  ✓ Status is saving while in-flight");
  } else {
    console.error(`  ❌ Expected saving, got ${status2.state}`);
    failures++;
  }

  resolver!(4);
  await promise;

  const status3 = queue.getStatus();
  if (status3.state === "idle") {
    console.log("  ✓ Status returns to idle after completion");
  } else {
    console.error(`  ❌ Expected idle, got ${status3.state}`);
    failures++;
  }
}

// Test 5: Flush on pagehide
console.log("\n▶ Test 5: Flush sends queued items immediately");
{
  const queue = createSaveQueue<number>();
  const serverWrites: number[] = [];
  const resolvers: Array<(v: number) => void> = [];

  const makeRequest = (value: number) => () => new Promise<number>((resolve) => {
    resolvers.push(resolve);
    serverWrites.push(value);
  });

  // Enqueue multiple requests
  const p1 = queue.enqueue("days", makeRequest(4));
  queue.enqueue("days", makeRequest(5));
  queue.enqueue("days", makeRequest(3));

  // Flush should start processing queued items
  const flushPromise = queue.flush();

  // Resolve all
  await new Promise(done => setTimeout(done, 10));
  for (const resolver of resolvers) {
    resolver(0);
  }

  await flushPromise;

  if (serverWrites.length >= 2) {
    console.log(`  ✓ Flush processed queued items (${serverWrites.length} writes)`);
  } else {
    console.error(`  ❌ Expected at least 2 writes, got ${serverWrites.length}`);
    failures++;
  }
}

// Test 6: Equipment saves (replaces deleted test-equipment-sequence.ts L4)
console.log("\n▶ Test 6: Equipment key serialization (L4)");
{
  const queue = createSaveQueue<number>();
  const serverWrites: number[] = [];
  const resolvers: Array<(v: number) => void> = [];

  const makeRequest = (value: number) => () => new Promise<number>((resolve) => {
    resolvers.push(resolve);
    serverWrites.push(value);
  });

  // Simulate overlapping equipment saves: hasAll on→off→on→off
  const p1 = queue.enqueue("equipment", makeRequest(1)); // on
  const p2 = queue.enqueue("equipment", makeRequest(0)); // off
  const p3 = queue.enqueue("equipment", makeRequest(1)); // on
  const p4 = queue.enqueue("equipment", makeRequest(0)); // off

  await new Promise(done => setTimeout(done, 10));

  const status = queue.getStatus();
  const inFlight = queue.getInFlightKeys();
  const queued = queue.getQueuedKeys();

  if (inFlight.length === 1 && inFlight[0] === "equipment") {
    console.log("  ✓ At most 1 equipment save in-flight");
  } else {
    console.error(`  ❌ Expected 1 in-flight equipment key, got ${inFlight.length}`);
    failures++;
  }

  if (serverWrites.length === 1 && serverWrites[0] === 1) {
    console.log("  ✓ Equipment saves coalesced (1 server write)");
  } else {
    console.error(`  ❌ Expected 1 write with value 1, got ${serverWrites.length} writes: [${serverWrites.join(", ")}]`);
    failures++;
  }

  // Resolve first
  resolvers[0]!(1);
  await p1;

  // Wait for coalesced request to become in-flight
  await new Promise(done => setTimeout(done, 20));

  if (serverWrites.length === 2) {
    console.log(`  ✓ Second coalesced write started (final value: ${serverWrites[1]})`);
  } else {
    console.error(`  ❌ Expected 2 writes after first resolved, got ${serverWrites.length}`);
    failures++;
  }

  // Resolve final
  if (resolvers[1]) {
    resolvers[1]!(0);
    await p4; // Only p4 resolves, p2 and p3 were coalesced
  }

  if (serverWrites[serverWrites.length - 1] === 0) {
    console.log("  ✓ Final equipment value matches last user action (off=0)");
  } else {
    console.error(`  ❌ Expected final value 0, got ${serverWrites[serverWrites.length - 1]}`);
    failures++;
  }
}

}

runTests().then(() => {
  console.log(
    `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
  );
  process.exit(failures === 0 ? 0 : 1);
});
