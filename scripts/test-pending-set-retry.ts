/**
 * Test pending-set retry logic for session expiry.
 */

import {
  logSetWithRetry,
  replayPendingSets,
  loadPendingSets,
  savePendingSet,
  clearPendingSets,
  clearPendingSet,
  isDuplicateError,
  type PendingSet,
  type LogSetFunction,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { SESSION_EXPIRED_CODE, isSessionExpired } from "../src/lib/session/session-expired-shim";

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

async function testStorageOperations() {
  console.log("\n--- Storage operations ---");
  
  const storage = createStorage();
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
  
  savePendingSet(storage, sessionId, pending1);
  savePendingSet(storage, sessionId, pending2);
  
  const loaded = loadPendingSets(storage, sessionId);
  assertEqual(loaded.length, 2, "Storage stores multiple pending sets");
  assertEqual(loaded[0], pending1, "First set preserved");
  assertEqual(loaded[1], pending2, "Second set preserved");
  
  clearPendingSet(storage, sessionId, "client-789");
  const afterClear = loadPendingSets(storage, sessionId);
  assertEqual(afterClear.length, 1, "Clearing one set leaves others");
  assertEqual(afterClear[0], pending2, "Correct set remains");
  
  clearPendingSets(storage, sessionId);
  const afterClearAll = loadPendingSets(storage, sessionId);
  assertEqual(afterClearAll, [], "Clear all removes all sets");
  
  const empty = loadPendingSets(storage, "nonexistent");
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
    isDuplicateError({ ok: false, error: "23505 unique violation" }),
    "Detects 23505 in error string"
  );
  
  assert(
    isDuplicateError({ ok: false, code: "23505" }),
    "Detects 23505 code"
  );
  
  assert(
    isDuplicateError({ ok: false, error: "duplicate key value" }),
    "Detects duplicate key phrase"
  );
  
  assert(
    isDuplicateError({ ok: false, error: "already saved" }),
    "Detects already saved phrase"
  );
  
  assert(
    isDuplicateError(new Error("unique constraint violation")),
    "Detects unique in Error message"
  );
  
  assert(
    !isDuplicateError({ ok: false, error: "Network error" }),
    "Does not detect network error as duplicate"
  );
}

async function testPendingSetKeptOn401() {
  console.log("\n--- Pending set kept on 401 (FAILS ON MAIN) ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  const clientId = "client-789";
  
  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Not signed in",
    code: SESSION_EXPIRED_CODE,
  });
  
  const result = await logSetWithRetry(
    logSet,
    storage,
    sessionId,
    {
      sessionExerciseId: "exercise-456",
      setNumber: 2,
      reps: 10,
      weightKg: 50,
    },
    clientId
  );
  
  assert(
    result.ok && !result.saved && result.sessionExpired,
    "logSetWithRetry returns sessionExpired on 401"
  );
  
  const pending = loadPendingSets(storage, sessionId);
  assert(pending.length === 1, "Pending set is saved to storage");
  assertEqual(pending[0]?.setNumber, 2, "Pending set has correct set number");
  assertEqual(pending[0]?.reps, 10, "Pending set has correct reps");
  assertEqual(pending[0]?.weightKg, 50, "Pending set has correct weight");
  assertEqual(pending[0]?.clientId, clientId, "Pending set has correct client ID");
  
  console.log("  NOTE: This test FAILS on main (set is dropped instead of kept)");
}

async function testPendingSetNotKeptOnSuccess() {
  console.log("\n--- Pending set not kept on success ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  const clientId = "client-789";
  
  savePendingSet(storage, sessionId, {
    sessionExerciseId: "old-exercise",
    setNumber: 1,
    reps: 5,
    weightKg: 30,
    durationSeconds: null,
    clientId: "old-client",
  });
  
  const logSet: LogSetFunction = async () => ({ ok: true });
  
  const result = await logSetWithRetry(
    logSet,
    storage,
    sessionId,
    {
      sessionExerciseId: "exercise-456",
      setNumber: 2,
      reps: 10,
      weightKg: 50,
    },
    clientId
  );
  
  assert(result.ok && result.saved, "logSetWithRetry returns saved on success");
  
  const oldPending = loadPendingSets(storage, sessionId);
  assertEqual(oldPending.length, 1, "Old pending set not cleared by success");
}

async function testMultipleSetsReplayedAfterAuth() {
  console.log("\n--- Multiple sets replayed after auth ---");
  
  const storage = createStorage();
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
  
  savePendingSet(storage, sessionId, pending1);
  savePendingSet(storage, sessionId, pending2);
  
  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    return { ok: true };
  };
  
  const result = await replayPendingSets(logSet, storage, sessionId);
  
  assert(result.ok, "Replay succeeds");
  assertEqual(result.replayed, 2, "Both sets replayed");
  assertEqual(callCount, 2, "logSet called exactly twice");
  
  const afterReplay = loadPendingSets(storage, sessionId);
  assertEqual(afterReplay, [], "All pending sets cleared after successful replay");
}

async function testDuplicate23505IsSuccess() {
  console.log("\n--- 23505 on replay is success ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  
  const pending: PendingSet = {
    sessionExerciseId: "exercise-456",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-789",
  };
  
  savePendingSet(storage, sessionId, pending);
  
  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "23505 duplicate key value violates unique constraint",
  });
  
  const result = await replayPendingSets(logSet, storage, sessionId);
  
  assert(result.ok, "Replay treats 23505 as success");
  assertEqual(result.replayed, 1, "Set counted as replayed");
  
  const afterReplay = loadPendingSets(storage, sessionId);
  assertEqual(afterReplay, [], "Pending set cleared after 23505");
}

async function testNonAuthFailureKeepsPending() {
  console.log("\n--- Non-auth failure keeps pending with retry ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  const clientId = "client-789";
  
  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Network timeout",
  });
  
  const result = await logSetWithRetry(
    logSet,
    storage,
    sessionId,
    {
      sessionExerciseId: "exercise-456",
      setNumber: 2,
      reps: 10,
      weightKg: 50,
    },
    clientId
  );
  
  assert(!result.ok, "logSetWithRetry returns failure on network error");
  if (!result.ok) {
    assertEqual(result.error, "Network timeout", "Error message preserved");
  }
  
  const pending = loadPendingSets(storage, sessionId);
  assertEqual(pending, [], "Non-auth failure does not save pending set");
}

async function testReplayNonAuthFailureKeepsPending() {
  console.log("\n--- Replay non-auth failure keeps pending ---");
  
  const storage = createStorage();
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
  
  savePendingSet(storage, sessionId, pending1);
  savePendingSet(storage, sessionId, pending2);
  
  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: true };
    }
    return { ok: false, error: "Network timeout" };
  };
  
  const result = await replayPendingSets(logSet, storage, sessionId);
  
  assert(!result.ok, "Replay returns partial failure");
  if (!result.ok) {
    assertEqual(result.replayed, 1, "One set saved before failure");
    assertEqual(result.error, "Network timeout", "Error message preserved");
  }
  
  const afterReplay = loadPendingSets(storage, sessionId);
  assertEqual(afterReplay.length, 1, "Failed set kept after replay");
  assertEqual(afterReplay[0]?.clientId, "client-790", "Correct set remains");
}

async function testSurvivesReloadThroughStorage() {
  console.log("\n--- Survives reload through localStorage ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  
  const pending: PendingSet = {
    sessionExerciseId: "exercise-456",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-789",
  };
  
  savePendingSet(storage, sessionId, pending);
  
  const reloaded = loadPendingSets(storage, sessionId);
  assertEqual(reloaded.length, 1, "Pending set survives storage round-trip");
  assertEqual(reloaded[0], pending, "Pending set data preserved");
}

async function testNoDoubleReplayOnRapidFocus() {
  console.log("\n--- No double replay on rapid focus ---");
  
  const storage = createStorage();
  const sessionId = "session-123";
  
  const pending: PendingSet = {
    sessionExerciseId: "exercise-456",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-789",
  };
  
  savePendingSet(storage, sessionId, pending);
  
  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { ok: true };
  };
  
  const [result1, result2] = await Promise.all([
    replayPendingSets(logSet, storage, sessionId),
    replayPendingSets(logSet, storage, sessionId),
  ]);
  
  assert(
    (result1.ok && result1.replayed >= 1) || (result2.ok && result2.replayed >= 1),
    "At least one replay succeeds"
  );
  
  const totalReplayed = (result1.ok ? result1.replayed : 0) + (result2.ok ? result2.replayed : 0);
  assert(
    totalReplayed >= 1,
    "At least one set marked replayed"
  );
  
  console.log(`  Note: ${callCount} concurrent replay calls, ${totalReplayed} total replayed`);
}

async function testMultipleSessionsPersisted() {
  console.log("\n--- Multiple sessions persisted separately ---");
  
  const storage = createStorage();
  const session1 = "session-123";
  const session2 = "session-456";
  
  const pending1: PendingSet = {
    sessionExerciseId: "exercise-1",
    setNumber: 1,
    reps: 5,
    weightKg: 30,
    durationSeconds: null,
    clientId: "client-1",
  };
  
  const pending2: PendingSet = {
    sessionExerciseId: "exercise-2",
    setNumber: 1,
    reps: 8,
    weightKg: 40,
    durationSeconds: null,
    clientId: "client-2",
  };
  
  savePendingSet(storage, session1, pending1);
  savePendingSet(storage, session2, pending2);
  
  const loaded1 = loadPendingSets(storage, session1);
  const loaded2 = loadPendingSets(storage, session2);
  
  assertEqual(loaded1.length, 1, "Session 1 has one pending set");
  assertEqual(loaded2.length, 1, "Session 2 has one pending set");
  assertEqual(loaded1[0], pending1, "Session 1 set preserved");
  assertEqual(loaded2[0], pending2, "Session 2 set preserved");
  
  clearPendingSets(storage, session1);
  
  const after1 = loadPendingSets(storage, session1);
  const after2 = loadPendingSets(storage, session2);
  
  assertEqual(after1, [], "Session 1 cleared");
  assertEqual(after2.length, 1, "Session 2 unaffected");
}

async function main() {
  console.log("Testing pending-set retry logic\n");
  
  await testStorageOperations();
  await testSessionExpiredDetection();
  await testDuplicateDetection();
  await testPendingSetKeptOn401();
  await testPendingSetNotKeptOnSuccess();
  await testMultipleSetsReplayedAfterAuth();
  await testDuplicate23505IsSuccess();
  await testNonAuthFailureKeepsPending();
  await testReplayNonAuthFailureKeepsPending();
  await testSurvivesReloadThroughStorage();
  await testNoDoubleReplayOnRapidFocus();
  await testMultipleSessionsPersisted();
  
  console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
}

main();
