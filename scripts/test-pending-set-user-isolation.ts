#!/usr/bin/env tsx
const FIXED_TIME = 1700000000000; // Nov 14, 2023
/**
 * Test: Pending set user isolation
 * 
 * Behavioral test verifying that:
 * - storageKey() returns different keys for different users
 * - User A's pending sets are not visible to User B
 * - Each user has their own isolated storage namespace
 */

import {
  storageKey,
  savePendingSet,
  loadPendingSets,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";


function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

let exitCode = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing pending set user isolation\n");

const storage = createStorage();
const deps = createPendingSetDeps(() => FIXED_TIME);
const sessionId = "session-123";

// Test: storageKey returns different keys for different users
const keyA = storageKey("user-a");
const keyB = storageKey("user-b");
assert(keyA !== keyB, "storageKey() returns different keys for different users");
assert(keyA.includes("user-a"), "User A's key includes their user ID");
assert(keyB.includes("user-b"), "User B's key includes their user ID");

// User A saves a pending set
const userA = "user-a";
savePendingSet(storage, userA, sessionId, {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-a-1",
}, deps);

// User B should not see User A's pending sets
const userB = "user-b";
const userBSets = loadPendingSets(storage, userB, sessionId, deps);
assertEqual(userBSets.length, 0, "User B cannot read User A's pending sets");

// User A can see their own sets
const userASets = loadPendingSets(storage, userA, sessionId, deps);
assertEqual(userASets.length, 1, "User A can read their own pending sets");
assertEqual(userASets[0].reps, 10, "User A's set has correct data");

// User B saves their own set
savePendingSet(storage, userB, sessionId, {
  sessionExerciseId: "ex-2",
  setNumber: 1,
  reps: 15,
  weightKg: 60,
  durationSeconds: null,
  clientId: "client-b-1",
}, deps);

// Each user sees only their own sets
const userASets2 = loadPendingSets(storage, userA, sessionId, deps);
const userBSets2 = loadPendingSets(storage, userB, sessionId, deps);
assertEqual(userASets2.length, 1, "User A still sees only their own set");
assertEqual(userASets2[0].reps, 10, "User A's set unchanged");
assertEqual(userBSets2.length, 1, "User B sees only their own set");
assertEqual(userBSets2[0].reps, 15, "User B's set has correct data");

console.log(exitCode === 0 ? "\n✅ All user isolation tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
