/**
const FIXED_TIME = 1700000000000; // Nov 14, 2023
 * Test pending-set controller behavior.
 */

import {
  createPendingSetController,
  canReplayForStatus,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE, resolveAuth } from "../src/lib/session/auth-result";
import type { Result } from "../src/app/session/actions";
import type { Storage } from "../src/lib/session/pending-set-retry";
import { storageKey } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = 1700000000000; // Nov 14, 2023

function createDeferred<T>() {
  let resolveFunc: ((value: T) => void) | undefined;
  let rejectFunc: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFunc = resolve;
    rejectFunc = reject;
  });
  if (!resolveFunc || !rejectFunc) {
    throw new Error("Deferred not initialized");
  }
  return { promise, resolve: resolveFunc, reject: rejectFunc };
}

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

async function testRapidFocusAndReplay() {
  console.log("\n--- Rapid onFocus + replay calls logSet once per set ---");

  const storage = createStorage();
  const sessionId = "session-123";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-1",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-1",
        },
        {
          sessionExerciseId: "ex-1",
          setNumber: 2,
          reps: 12,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-2",
        },
      ],
    })
  );

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.onFocus();
  controller.onFocus();
  controller.onFocus();
  controller.onFocus();
  controller.onFocus();

  const replayPromises = [
    controller.replay(),
    controller.replay(),
    controller.replay(),
  ];

  await Promise.all(replayPromises);

  assertEqual(callCount, 2, "logSet called exactly twice (once per pending set)");
  assert(states[states.length - 1].pending.length === 0, "All pending sets cleared");
  assert(!states[states.length - 1].expired, "Expired flag cleared");
}

async function testPrefilledStorageLoadsAndReplays() {
  console.log("\n--- Pre-filled storage loads and replays ---");

  const storage = createStorage();
  const sessionId = "session-456";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-2",
          setNumber: 1,
          reps: 8,
          weightKg: 40,
          durationSeconds: null,
          clientId: "client-3",
        },
      ],
    })
  );

  let called = false;
  const logSet: LogSetFunction = async () => {
    called = true;
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  controller.load();

  assert(states[0].pending.length === 1, "Pending set loaded from storage after load()");
  assert(states[0].expired, "Expired flag set when pending sets exist");

  await controller.replay();

  assert(called, "logSet called during replay");
  assert(
    states[states.length - 1].pending.length === 0,
    "Pending set cleared after replay"
  );
}

async function testUnresolvedPromiseNotMarkedSaved() {
  console.log("\n--- Unresolved promise doesn't mark as saved ---");

  const storage = createStorage();
  const sessionId = "session-789";

  const logSetDeferred = createDeferred<Result>();
  const logSet: LogSetFunction = () => {
    return logSetDeferred.promise;
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  const submitPromise = controller.submit({
    sessionExerciseId: "ex-3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-4",
  });

  // Check state before resolving
  assert(!states.some((s) => s.pending.length === 0), "Not marked as saved while promise unresolved");

  // Now resolve the action
  logSetDeferred.resolve({ ok: true });

  const result = await submitPromise;
  assertEqual(result.status, "saved", "Marked as saved only after promise resolves");
}

async function testServerSideAuthReturnsCode() {
  console.log("\n--- Server-side auth returns code, doesn't throw ---");

  const noUser = async () => ({ user: null });
  const hasUser = async () => ({ user: { id: "user-123" } });

  const noUserResult = await resolveAuth(noUser, async (): Promise<Result> => ({ ok: true }));

  assert(!noUserResult.ok, "Returns failure when no user");
  if (!noUserResult.ok) {
    assertEqual(
      noUserResult.code,
      SESSION_EXPIRED_CODE,
      "Returns SESSION_EXPIRED code"
    );
    assert(
      typeof noUserResult.error === "string",
      "Error is string, not thrown exception"
    );
  }

  const hasUserResult = await resolveAuth(hasUser, async (): Promise<Result> => ({ ok: true }));

  assert(hasUserResult.ok, "Returns success when user exists");

  const throwingAuth = async () => {
    throw new Error("Not signed in");
  };
  const thrownResult = await resolveAuth(throwingAuth, async (): Promise<Result> => ({ ok: true }));
  assert(!thrownResult.ok, "Caught thrown auth error");
  if (!thrownResult.ok) {
    assertEqual(thrownResult.code, SESSION_EXPIRED_CODE, "Thrown error returns SESSION_EXPIRED code");
  }
}

async function testSingleFlightReplayGuard() {
  console.log("\n--- Single-flight guard prevents concurrent replays ---");

  const storage = createStorage();
  const sessionId = "session-999";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-4",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-5",
        },
      ],
    })
  );

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    return { ok: true };
  };

  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: () => {},
  });

  const promises = [
    controller.replay(),
    controller.replay(),
    controller.replay(),
    controller.replay(),
    controller.replay(),
  ];

  await Promise.all(promises);

  assertEqual(callCount, 1, "logSet called exactly once despite 5 concurrent replay calls");

  await controller.replay();

  assertEqual(callCount, 1, "Replay after completion is no-op (nothing pending)");
}

async function testSessionExpiredHandling() {
  console.log("\n--- Session expired handling ---");

  const storage = createStorage();
  const sessionId = "session-exp";

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Not signed in",
    code: SESSION_EXPIRED_CODE,
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-5",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-6",
  });

  assertEqual(result.status, "expired", "Returns expired status");
  assert(states[states.length - 1].expired, "Sets expired flag");
  assert(states[states.length - 1].pending.length === 1, "Keeps pending set");
}

async function testDuplicate23505() {
  console.log("\n--- 23505 duplicate treated as success ---");

  const storage = createStorage();
  const sessionId = "session-dup";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-6",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-7",
        },
      ],
    })
  );

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "23505 duplicate key",
    code: "23505",
  });

  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: () => {},
  });

  await controller.replay();

  const remaining = storage.getItem(storageKey("test-user-id"));
  assert(
    !remaining || !JSON.parse(remaining)[sessionId],
    "Pending set cleared on 23505"
  );
}

async function testNetworkErrorKeepsPending() {
  console.log("\n--- Network error keeps pending ---");

  const storage = createStorage();
  const sessionId = "session-net";

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Network timeout",
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-7",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-8",
  });

  assertEqual(result.status, "failed", "Returns failed status");
  if (result.status === "failed") {
    assertEqual(result.error, "Network timeout", "Error message preserved");
  }
  assert(
    !states[states.length - 1].pending.length,
    "Non-auth failure doesn't persist to storage"
  );
}

async function testThrownSessionExpired() {
  console.log("\n--- Thrown SESSION_EXPIRED error handled ---");

  const storage = createStorage();
  const sessionId = "session-thrown";

  const logSet: LogSetFunction = async () => {
    throw new Error("SESSION_EXPIRED: Token expired");
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-8",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-9",
  });

  assertEqual(result.status, "expired", "Thrown SESSION_EXPIRED returns expired status");
  assert(states[states.length - 1].expired, "Sets expired flag");
  assert(states[states.length - 1].pending.length === 1, "Keeps pending set");
}

async function testThrownSessionExpiredInReplay() {
  console.log("\n--- Thrown SESSION_EXPIRED in replay keeps pending ---");

  const storage = createStorage();
  const sessionId = "session-thrown-replay";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-9",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-10",
        },
      ],
    })
  );

  const logSet: LogSetFunction = async () => {
    throw new Error("SESSION_EXPIRED: Token expired");
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  const remaining = storage.getItem(storageKey("test-user-id"));
  const parsed = remaining ? JSON.parse(remaining) : {};
  assert(
    parsed[sessionId] && 
    parsed[sessionId].sets && 
    parsed[sessionId].sets.length === 1,
    "Pending set remains after thrown SESSION_EXPIRED in replay"
  );
  
  const finalState = states[states.length - 1];
  assert(finalState.expired, "Expired flag stays true after thrown SESSION_EXPIRED in replay (A3)");
  assert(finalState.pending.length === 1, "Set still pending");
}

async function testReplayedSetsReported() {
  console.log("\n--- Replayed sets reported in state ---");

  const storage = createStorage();
  const sessionId = "session-replayed";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-10",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-11",
        },
        {
          sessionExerciseId: "ex-10",
          setNumber: 2,
          reps: 12,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-12",
        },
      ],
    })
  );

  const logSet: LogSetFunction = async () => ({ ok: true });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  const finalState = states[states.length - 1];
  assertEqual(finalState.replayed.length, 2, "Replayed sets reported in state");
  assert(finalState.pending.length === 0, "Pending sets cleared");
}

async function testReplayIntoEndedSessionRefused() {
  console.log("\n--- Replay into ended session refused/dropped ---");

  const storage = createStorage();
  const sessionId = "session-ended";

  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: [
        {
          sessionExerciseId: "ex-11",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-13",
        },
      ],
    })
  );

  let logSetCalled = false;
  const logSet: LogSetFunction = async () => {
    logSetCalled = true;
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "completed",
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  assert(!logSetCalled, "logSet not called for ended session");
  const finalState = states[states.length - 1];
  assertEqual(finalState.pending.length, 0, "Pending sets cleared when session ended");
  assert(!finalState.expired, "Not marked expired when session ended");

  const remaining = storage.getItem(storageKey("test-user-id"));
  const parsed = remaining ? JSON.parse(remaining) : {};
  assert(!parsed[sessionId] || parsed[sessionId].length === 0, "Storage cleared for ended session");
}

function testCanReplayForStatusHelper() {
  console.log("\n--- canReplayForStatus helper ---");

  assert(canReplayForStatus("in_progress"), "Can replay for in_progress session");
  assert(!canReplayForStatus("completed"), "Cannot replay for completed session");
  assert(!canReplayForStatus("ended"), "Cannot replay for ended session");
  assert(!canReplayForStatus("cancelled"), "Cannot replay for cancelled session");
  assert(!canReplayForStatus(""), "Cannot replay for empty session status");
}

async function testReplayErrorAfterSignIn() {
  console.log("\n--- Replay network error after sign-in shows replay-error mode ---");

  const storage = createStorage();
  const sessionId = "session-replay-error";

  // Pre-populate storage with a pending set (as if it was saved during a previous SESSION_EXPIRED)
  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      [sessionId]: {
        sets: [
          {
            sessionExerciseId: "ex-replay",
            setNumber: 1,
            reps: 10,
            weightKg: 50,
            durationSeconds: null,
            clientId: "client-replay",
          },
        ],
        timestamp: 1700000000000,
      },
    })
  );

  // Simulate: user has signed back in, but replay fails with a network error
  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Failed to fetch",
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId: "test-user-id",
    deps: createPendingSetDeps(FIXED_TIME),
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  const finalState = states[states.length - 1];
  assert(finalState.pending.length === 1, "Set still pending after network error");
  assert(!finalState.expired, "Expired flag cleared after non-auth failure");
  assertEqual(finalState.error, "Failed to fetch", "Error message preserved");
}

async function main() {
  console.log("Testing pending-set controller\n");

  await testRapidFocusAndReplay();
  await testPrefilledStorageLoadsAndReplays();
  await testUnresolvedPromiseNotMarkedSaved();
  await testServerSideAuthReturnsCode();
  await testSingleFlightReplayGuard();
  await testSessionExpiredHandling();
  await testDuplicate23505();
  await testNetworkErrorKeepsPending();
  await testThrownSessionExpired();
  await testThrownSessionExpiredInReplay();
  await testReplayedSetsReported();
  await testReplayIntoEndedSessionRefused();
  testCanReplayForStatusHelper();
  await testReplayErrorAfterSignIn();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
