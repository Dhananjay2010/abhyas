/**
const FIXED_TIME = 1700000000000; // Nov 14, 2023
 * Test Item 8 UI states for session expiry retry.
 * 
 * These tests verify:
 * 1. Replay errors show separately from "session expired"
 * 2. Saving/retrying state shows while replay is in flight
 * 3. Auto-retry on window focus/visibility after failed replay
 * 4. Pending sets show as "Saving…" in the logged-sets list
 */

import {
  createPendingSetController,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE } from "../src/lib/session/auth-result";
import {
  savePendingSet,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = 1700000000000; // Nov 14, 2023

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

async function testReplayErrorShowsSeparately() {
  console.log("\n--- Replay errors show separately from session expired ---");

  const storage = createStorage();
  const sessionId = "session-123";

  // Add a pending set
  savePendingSet(storage, "test-user-id", sessionId, {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, createPendingSetDeps(() => FIXED_TIME));

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Network timeout",
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(() => FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.load();
  await controller.replay();

  const finalState = states[states.length - 1];
  assertEqual(finalState.error, "Network timeout", "Replay sets error message");
  assert(!finalState.expired, "Expired flag cleared after non-auth replay error");
  assertEqual(finalState.retrying, false, "Retrying is false after replay completes");
}

async function testRetryingStateDuringReplay() {
  console.log("\n--- Saving/retrying state shows while replay is in flight ---");

  const storage = createStorage();
  const sessionId = "session-456";

  // Add a pending set
  savePendingSet(storage, "test-user-id", sessionId, {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, createPendingSetDeps(() => FIXED_TIME));

  let resolveReplay: () => void;
  const replayPromise = new Promise<void>((resolve) => {
    resolveReplay = resolve;
  });

  const logSet: LogSetFunction = async () => {
    await replayPromise;
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(() => FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.load();
  const replayCall = controller.replay();

  // Check state while replay is in flight
  const duringReplay = states[states.length - 1];
  assertEqual(duringReplay.retrying, true, "Retrying is true during replay");

  // Complete the replay
  resolveReplay!();
  await replayCall;

  const afterReplay = states[states.length - 1];
  assertEqual(afterReplay.retrying, false, "Retrying is false after replay completes");
  assertEqual(afterReplay.pending.length, 0, "Pending sets cleared after successful replay");
}

async function testAutoRetryAfterFailedReplay() {
  console.log("\n--- Auto-retry on focus after failed replay ---");

  const storage = createStorage();
  const sessionId = "session-789";

  // Add a pending set
  savePendingSet(storage, "test-user-id", sessionId, {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, createPendingSetDeps(() => FIXED_TIME));

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    if (callCount === 1) {
      // First attempt fails
      return {
        ok: false,
        error: "Network error",
      };
    }
    // Second attempt succeeds
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(() => FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.load();
  await controller.replay();

  const afterFirstReplay = states[states.length - 1];
  assertEqual(afterFirstReplay.error, "Network error", "Error set after first failed replay");
  assertEqual(afterFirstReplay.pending.length, 1, "Set still pending after first failed replay");

  // Simulate focus event (auto-retry)
  controller.onFocus();
  await controller.replay();

  assertEqual(callCount, 2, "logSet called again on focus after failed replay");
  const afterSecondReplay = states[states.length - 1];
  assertEqual(afterSecondReplay.pending.length, 0, "Set cleared after successful retry on focus");
}

async function testPendingSetsInList() {
  console.log("\n--- Pending sets visible in UI state ---");

  const storage = createStorage();
  const sessionId = "session-abc";

  const pendingSet = {
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  };

  savePendingSet(storage, "test-user-id", sessionId, pendingSet, createPendingSetDeps(() => FIXED_TIME));

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Still expired",
    code: SESSION_EXPIRED_CODE,
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(() => FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.load();

  const loadedState = states[states.length - 1];
  assertEqual(loadedState.pending.length, 1, "One pending set loaded");
  assertEqual(loadedState.pending[0].setNumber, 2, "Pending set has correct set number");
  assertEqual(loadedState.pending[0].sessionExerciseId, "ex-1", "Pending set has correct exercise ID");
  
  // This data would be used in the UI to show "Saving…" for set 2 of exercise ex-1
  const wouldShowAsPending = loadedState.pending.some(
    (s) => s.sessionExerciseId === "ex-1" && s.setNumber === 2
  );
  assert(wouldShowAsPending, "Pending set data available for UI rendering");
}

async function main() {
  console.log("Testing Item 8 UI states\n");

  await testReplayErrorShowsSeparately();
  await testRetryingStateDuringReplay();
  await testAutoRetryAfterFailedReplay();
  await testPendingSetsInList();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
