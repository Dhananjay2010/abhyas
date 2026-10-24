#!/usr/bin/env tsx
/**
 * Test: Clear pending sets on sign-out
 * 
 * Verifies that pending sets are cleared when a user signs out:
 * - Pending sets exist before sign-out
 * - After clearing, pending sets are gone
 * - Storage key is removed
 * - signout-button.tsx actually calls removeItem(storageKey(userId))
 */

import {
  savePendingSet,
  loadPendingSets,
  storageKey,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import { readFileSync } from "fs";

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

console.log("Testing clear on sign-out\n");

// First check that signout-button.tsx actually clears storage
const signoutButtonCode = readFileSync("src/app/settings/signout-button.tsx", "utf-8");
// Check that the code contains an active (uncommented) localStorage.removeItem call
const removeItemLine = signoutButtonCode.split('\n').find(line => 
  line.includes('window.localStorage.removeItem') && 
  line.includes('storageKey(userId)') &&
  !line.trim().startsWith('//')
);
assert(
  removeItemLine !== undefined,
  "signout-button.tsx must have an active (uncommented) window.localStorage.removeItem(storageKey(userId)) call"
);

const storage = createStorage();
const deps = createPendingSetDeps();
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
assertEqual(beforeClear.length, 1, "Pending set exists before sign-out");

// Simulate sign-out: remove the storage key
const key = storageKey(userId);
const keyExistsBefore = storage.getItem(key) !== null;
assert(keyExistsBefore, "Storage key exists before sign-out");

storage.removeItem(key);

// Verify it's gone by checking storage directly
const keyExistsAfter = storage.getItem(key) !== null;
assert(!keyExistsAfter, "Storage key removed after sign-out");

const afterClear = loadPendingSets(storage, userId, sessionId, deps);
assertEqual(afterClear.length, 0, "Pending sets cleared after sign-out");

// Save another set to verify we can still write after clearing
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-2",
  setNumber: 2,
  reps: 12,
  weightKg: 55,
  durationSeconds: null,
  clientId: "client-2",
}, deps);

const afterResave = loadPendingSets(storage, userId, sessionId, deps);
assertEqual(afterResave.length, 1, "Can save new sets after sign-out");
assertEqual(afterResave[0].setNumber, 2, "New set has correct data");

console.log(exitCode === 0 ? "\n✅ All sign-out tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
