/**
 * Test pending-set retry logic for session expiry.
 */

import {
  loadPendingSets,
  savePendingSet,
  clearPendingSets,
  clearPendingSet,
  isDuplicateError,
  type PendingSet,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { SESSION_EXPIRED_CODE, isSessionExpired } from "../src/lib/auth/session-expired";
import { createPendingSetDeps, type PendingSetDeps } from "../src/lib/session/pending-set-deps";

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

function createTestDeps(): PendingSetDeps {
  return createPendingSetDeps();
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
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual:   ${actualStr}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

async function testStorageOperations() {
  console.log("\n--- Storage operations ---");
  
  const storage = createStorage();
  const deps = createTestDeps();
  const sessionId = "session-123";
  
  const pending1: PendingSet = {
    sessionExerciseId: "exercise-456",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-789",
  };
  
  const pending2: PendingSet = {
    sessionExerciseId: "exercise-456",
    setNumber: 3,
    reps: 12,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-790",
  };
  
  savePendingSet(storage, "test-user-id", sessionId, pending1, deps);
  savePendingSet(storage, "test-user-id", sessionId, pending2, deps);
  
  const loaded = loadPendingSets(storage, "test-user-id", sessionId, deps);
  assertEqual(loaded.length, 2, "Storage stores multiple pending sets");
  assertEqual(loaded[0], pending1, "First set preserved");
  assertEqual(loaded[1], pending2, "Second set preserved");
  
  clearPendingSet(storage, "test-user-id", sessionId, "client-789", deps);
  const afterClear = loadPendingSets(storage, "test-user-id", sessionId, deps);
  assertEqual(afterClear.length, 1, "Clearing one set leaves others");
  assertEqual(afterClear[0], pending2, "Correct set remains");
  
  clearPendingSets(storage, "test-user-id", sessionId, deps);
  const afterClearAll = loadPendingSets(storage, "test-user-id", sessionId, deps);
  assertEqual(afterClearAll, [], "Clear all removes all sets");
  
  const empty = loadPendingSets(storage, "test-user-id", "nonexistent", deps);
  assertEqual(empty, [], "Load from empty storage returns empty array");
}

async function testSessionExpiredDetection() {
  console.log("\n--- Session expired detection ---");
  
  assert(
    isSessionExpired({ ok: false, code: SESSION_EXPIRED_CODE }),
    "Detects SESSION_EXPIRED code"
  );
  
  assert(
    isSessionExpired({ ok: false, error: "Not signed in", code: SESSION_EXPIRED_CODE }),
    "Detects SESSION_EXPIRED with error message"
  );
  
  assert(
    isSessionExpired(new Error("SESSION_EXPIRED: token invalid")),
    "Detects SESSION_EXPIRED prefix in Error"
  );
  
  assert(
    !isSessionExpired({ ok: false, error: "Not signed in" }),
    "Does not detect auth error without code"
  );
  
  assert(
    !isSessionExpired({ ok: false, error: "Network timeout" }),
    "Does not detect network error as session expired"
  );
  
  assert(
    !isSessionExpired({ ok: true }),
    "Does not detect success as session expired"
  );
}

async function testDuplicateDetection() {
  console.log("\n--- Duplicate error detection ---");
  
  assert(
    isDuplicateError({ ok: false, code: "23505" }),
    "Detects 23505 code"
  );
  
  assert(
    !isDuplicateError({ ok: false, error: "23505 unique violation" }),
    "Does not detect 23505 in error string without code"
  );
  
  assert(
    !isDuplicateError({ ok: false, error: "Network error" }),
    "Does not detect network error as duplicate"
  );
}

async function main() {
  console.log("Testing pending-set storage helpers\n");
  
  await testStorageOperations();
  await testSessionExpiredDetection();
  await testDuplicateDetection();
  
  console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
}

main();
