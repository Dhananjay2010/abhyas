/**
 * Test critical behaviors for session expiry retry.
 * 
 * These tests verify:
 * 1. A duplicate (23505) in submit counts as saved
 * 2. Replay doesn't clear a set before server confirms it
 * 3. Replay keeps a still-expired set pending
 * 4. savePendingSet dedupes by clientId
 * 5. Bad JSON fallback clears storage
 */

import {
  createPendingSetController,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE } from "../src/lib/session/auth-result";
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

async function test23505InSubmitCountsAsSaved() {
  console.log("\n--- Duplicate (23505) in submit counts as saved ---");

  const storage = createStorage();
  const sessionId = "session-123";

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "duplicate key value violates unique constraint",
    code: "23505",
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  });

  assertEqual(result.status, "saved", "23505 in submit returns 'saved' status");
  
  // Check storage directly - should be empty (not saved as pending)
  const pending = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(pending.length, 0, "23505 set not saved to storage (already exists on server)");
}

async function testReplayDoesntClearBeforeConfirm() {
  console.log("\n--- Replay doesn't clear set before server confirms ---");

  const storage = createStorage();
  const sessionId = "session-456";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: {
        sets: [
          {
            sessionExerciseId: "ex-1",
            setNumber: 1,
            reps: 10,
            weightKg: 50,
            durationSeconds: null,
            clientId: "client-1",
          },
        ],
        timestamp: Date.now(),
      },
    })
  );

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    // Simulate network timeout (no response yet)
    return new Promise(() => {});
  };

  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: () => {},
  });

  // Start replay (doesn't await - it hangs)
  controller.replay();

  // Check storage immediately - set should still be there
  const remaining = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(remaining.length, 1, "Set still in storage while request pending");
  assertEqual(callCount, 1, "Server was called once");
}

async function testReplayKeepsStillExpiredSetPending() {
  console.log("\n--- Replay keeps still-expired set pending ---");

  const storage = createStorage();
  const sessionId = "session-789";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: {
        sets: [
          {
            sessionExerciseId: "ex-1",
            setNumber: 1,
            reps: 10,
            weightKg: 50,
            durationSeconds: null,
            clientId: "client-1",
          },
        ],
        timestamp: Date.now(),
      },
    })
  );

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Not signed in",
    code: SESSION_EXPIRED_CODE,
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  const finalState = states[states.length - 1];
  assertEqual(finalState.pending.length, 1, "Set still pending after failed replay");
  assert(finalState.expired, "Still marked as expired");
  
  const remaining = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(remaining.length, 1, "Set remains in storage");
}

async function testSavePendingSetDedupes() {
  console.log("\n--- savePendingSet dedupes by clientId ---");

  const storage = createStorage();
  const sessionId = "session-abc";

  const set = {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  };

  // Save the same set twice
  savePendingSet(storage, "test-user-id", sessionId, set, createPendingSetDeps());
  savePendingSet(storage, "test-user-id", sessionId, set, createPendingSetDeps());

  const loaded = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(loaded.length, 1, "Duplicate clientId not saved twice");

  savePendingSet(storage, "test-user-id", sessionId, {
    ...set,
    clientId: "client-2",
  }, createPendingSetDeps());

  const loaded2 = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(loaded2.length, 2, "Different clientId is saved");
}

async function testBadJsonFallback() {
  console.log("\n--- Bad JSON fallback clears storage ---");

  const storage = createStorage();
  const sessionId = "session-xyz";

  // Put invalid JSON in storage
  storage.setItem(storageKey("test-user-id"), "{invalid json}");

  const loaded = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());

  assertEqual(loaded, [], "Returns empty array for bad JSON");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Bad JSON cleared from storage");

  // Verify we can save after bad JSON
  savePendingSet(storage, "test-user-id", sessionId, {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, createPendingSetDeps());

  const loaded2 = loadPendingSets(storage, "test-user-id", sessionId, createPendingSetDeps());
  assertEqual(loaded2.length, 1, "Can save after bad JSON recovery");
}

async function main() {
  console.log("Testing critical session expiry behaviors\n");

  await test23505InSubmitCountsAsSaved();
  await testReplayDoesntClearBeforeConfirm();
  await testReplayKeepsStillExpiredSetPending();
  await testSavePendingSetDedupes();
  await testBadJsonFallback();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
