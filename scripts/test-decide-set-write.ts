#!/usr/bin/env tsx
/*
 * Test: decideSetWrite pure logic
 *
 * Tests the pure decision function that determines whether to insert, accept
 * as duplicate, or reject as conflict when logging a set.
 */

import { decideSetWrite, type ExistingSet, type SetWriteInput } from "../src/lib/session/decide-set-write";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function testDecide(name: string, fn: () => void | Promise<void>) {
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

function assertEqualDecide<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing decideSetWrite pure logic\n");

  // Test 1: No existing set -> insert
  await testDecide("No existing set: returns 'insert'", () => {
    const decision = decideSetWrite(null, { reps: 10, weightKg: 60, durationSeconds: null });
    assertEqualDecide(decision, "insert");
  });

  // Test 2: Existing set with identical values -> duplicate_ok
  await testDecide("Existing set with identical values: returns 'duplicate_ok'", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: 60, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 10, weightKg: 60, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "duplicate_ok");
  });

  // Test 3: Existing set with different reps -> conflict
  await testDecide("Existing set with different reps: returns 'conflict'", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: 60, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 12, weightKg: 60, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 4: Existing set with different weight -> conflict
  await testDecide("Existing set with different weight: returns 'conflict'", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: 60, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 10, weightKg: 65, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 5: Existing set with different duration -> conflict
  await testDecide("Existing set with different duration: returns 'conflict'", () => {
    const existing: ExistingSet = { reps: null, weight_kg: null, duration_seconds: 30 };
    const incoming: SetWriteInput = { reps: null, weightKg: null, durationSeconds: 45 };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 6: Both have null weight -> duplicate_ok
  await testDecide("Both null weight (bodyweight): returns 'duplicate_ok'", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: null, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 10, weightKg: null, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "duplicate_ok");
  });

  // Test 7: One null weight, one with weight -> conflict
  await testDecide("One null weight, one with weight: returns 'conflict'", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: null, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 10, weightKg: 60, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 8: Timed hold with identical duration -> duplicate_ok
  await testDecide("Timed hold with identical duration: returns 'duplicate_ok'", () => {
    const existing: ExistingSet = { reps: null, weight_kg: null, duration_seconds: 45 };
    const incoming: SetWriteInput = { reps: null, weightKg: null, durationSeconds: 45 };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "duplicate_ok");
  });

  // Test 9: Weight comparison with decimal precision
  await testDecide("Weight comparison with decimal precision: duplicate_ok", () => {
    const existing: ExistingSet = { reps: 8, weight_kg: 62.5, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 8, weightKg: 62.5, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "duplicate_ok");
  });

  // Test 10: Weight comparison with decimal mismatch
  await testDecide("Weight comparison with decimal mismatch: conflict", () => {
    const existing: ExistingSet = { reps: 8, weight_kg: 62.5, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 8, weightKg: 63.0, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 11: B1 regression scenario - stale client tries to overwrite
  await testDecide("B1 regression: saved 12×30, stale logs 15×35: conflict", () => {
    const existing: ExistingSet = { reps: 12, weight_kg: 30, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 15, weightKg: 35, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "conflict");
  });

  // Test 12: Offline outbox replays identical set -> duplicate_ok
  await testDecide("Offline outbox replay with identical values: duplicate_ok", () => {
    const existing: ExistingSet = { reps: 10, weight_kg: 60, duration_seconds: null };
    const incoming: SetWriteInput = { reps: 10, weightKg: 60, durationSeconds: null };
    const decision = decideSetWrite(existing, incoming);
    assertEqualDecide(decision, "duplicate_ok");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
