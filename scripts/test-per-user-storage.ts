#!/usr/bin/env tsx
/**
 * Test: Per-user storage keys
 * 
 * Verifies that pending sets are isolated per user:
 * - User A's sets are not visible to User B
 * - storageKey includes userId
 * - Each user has their own namespace
 */

import {
  savePendingSet,
  loadPendingSets,
  storageKey,
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing per-user storage isolation\n");

const storage = createStorage();
const deps = createPendingSetDeps();
const sessionId = "session-123";

// User A saves a pending set
const userA = "user-a-id";
savePendingSet(storage, userA, sessionId, {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-a-1",
}, deps);

// User B should not see User A's pending sets
const userB = "user-b-id";
const userBSets = loadPendingSets(storage, userB, sessionId, deps);

assertEqual(userBSets.length, 0, "User B cannot see User A's pending sets");

// User A can still see their own sets
const userASets = loadPendingSets(storage, userA, sessionId, deps);
assertEqual(userASets.length, 1, "User A can see their own pending sets");
assertEqual(userASets[0].reps, 10, "User A's set has correct data");

// Storage keys are different per user
const keyA = storageKey(userA);
const keyB = storageKey(userB);
assert(keyA !== keyB, "Storage keys differ between users");
assert(keyA.includes(userA), "User A's key includes their user ID");
assert(keyB.includes(userB), "User B's key includes their user ID");

// User B saves their own set
savePendingSet(storage, userB, sessionId, {
  sessionExerciseId: "ex-2",
  setNumber: 1,
  reps: 15,
  weightKg: 60,
  durationSeconds: null,
  clientId: "client-b-1",
}, deps);

// User B can see their own set, not User A's
const userBSets2 = loadPendingSets(storage, userB, sessionId, deps);
assertEqual(userBSets2.length, 1, "User B sees only their own set");
assertEqual(userBSets2[0].reps, 15, "User B's set has correct data");

// User A still sees only their own set
const userASets2 = loadPendingSets(storage, userA, sessionId, deps);
assertEqual(userASets2.length, 1, "User A still sees only their own set");
assertEqual(userASets2[0].reps, 10, "User A's set unchanged");

console.log(exitCode === 0 ? "\n✅ All per-user storage tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
