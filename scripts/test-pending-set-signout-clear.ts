#!/usr/bin/env tsx
const FIXED_TIME = 1700000000000; // Nov 14, 2023
/**
 * Test: Pending set sign-out clear
 * 
 * Behavioral test verifying that:
 * - Pending sets exist before clear
 * - Calling clearAllPendingSetsForUser(storage, userId) clears the user's pending sets
 * - loadPendingSets returns empty array after clear
 */

import {
  storageKey,
  savePendingSet,
  loadPendingSets,
  clearAllPendingSetsForUser,
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

console.log("Testing pending set sign-out clear\n");

const storage = createStorage();
const deps = createPendingSetDeps(FIXED_TIME);
const userId = "test-user";
const sessionId = "session-123";

// Save a pending set
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-1",
}, deps);

// Verify it exists
const beforeClear = loadPendingSets(storage, userId, sessionId, deps);
assertEqual(beforeClear.length, 1, "Pending set exists before clear");

// Simulate sign-out clear: clearAllPendingSetsForUser(storage, userId)
clearAllPendingSetsForUser(storage, userId);

// Verify it's gone
const afterClear = loadPendingSets(storage, userId, sessionId, deps);
assertEqual(afterClear.length, 0, "Pending sets cleared after clearAllPendingSetsForUser");

// Verify storage key is actually removed
const storageValue = storage.getItem(storageKey(userId));
assert(storageValue === null, "Storage key removed from storage");

// Save another set to verify storage still works
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-2",
  setNumber: 2,
  reps: 12,
  weightKg: 55,
  durationSeconds: null,
  clientId: "client-2",
}, deps);

const afterResave = loadPendingSets(storage, userId, sessionId, deps);
assertEqual(afterResave.length, 1, "Can save new sets after clear");
assertEqual(afterResave[0].setNumber, 2, "New set has correct data");

console.log(exitCode === 0 ? "\n✅ All sign-out clear tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
