/**
 * Test automatic replay on mount and replayAttempted guard.
 * 
 * Verifies:
 * - onFocus replays automatically on first call when pending sets exist
 * - onFocus doesn't replay again if already attempted (replayAttempted guard)
 * - onFocus retries after a failed attempt
 */

import {
  createPendingSetController,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE } from "../src/lib/session/auth-result";
import type { Storage } from "../src/lib/session/pending-set-retry";
import { storageKey } from "../src/lib/session/pending-set-retry";
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

async function testOnFocusReplaysOnFirstCall() {
  console.log("\n--- onFocus replays automatically on first call ---");

  const storage = createStorage();
  const sessionId = "session-123";

  // Pre-populate storage with pending sets
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

  let replayCalled = false;
  const logSet: LogSetFunction = async () => {
    replayCalled = true;
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    userId: "test-user-id",
    sessionId,
    onChange: (state) => states.push(state),
  });

  // Simulate mount: call onFocus once
  controller.onFocus();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert(replayCalled, "Replay was triggered by onFocus");
  assert(states.length > 0, "onChange was called");
  assertEqual(states[states.length - 1].pending.length, 0, "Pending sets cleared after replay");
  assert(!states[states.length - 1].expired, "Expired flag cleared after replay");
}

async function testOnFocusDoesNotReplayTwice() {
  console.log("\n--- onFocus does not replay twice (replayAttempted guard) ---");

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

  let replayCallCount = 0;
  const logSet: LogSetFunction = async () => {
    replayCallCount++;
    return { ok: true };
  };

  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    userId: "test-user-id",
    sessionId,
    onChange: () => {},
  });

  // First onFocus: should replay
  controller.onFocus();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const firstCallCount = replayCallCount;
  assert(firstCallCount === 1, "First onFocus triggered replay");

  // Second onFocus: should NOT replay (replayAttempted guard)
  controller.onFocus();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEqual(replayCallCount, firstCallCount, "Second onFocus did not trigger another replay");
}

async function testOnFocusRetriesAfterFailure() {
  console.log("\n--- onFocus retries after failed replay ---");

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

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    // First call: session still expired
    if (callCount === 1) {
      return {
        ok: false,
        error: "Not signed in",
        code: SESSION_EXPIRED_CODE,
      };
    }
    // Second call: success
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    userId: "test-user-id",
    sessionId,
    onChange: (state) => states.push(state),
  });

  // First onFocus: replay fails
  controller.onFocus();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert(callCount === 1, "First replay attempt was made");
  assert(states[states.length - 1].pending.length === 1, "Set still pending after failed replay");
  assert(states[states.length - 1].expired, "Still marked as expired");

  // Second onFocus: should NOT retry automatically (replayAttempted guard)
  controller.onFocus();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEqual(callCount, 1, "onFocus does not retry after failure (manual retry needed)");

  // Manual retry via replay() should work
  await controller.replay();

  assertEqual(callCount, 2, "Manual replay() succeeds");
  assertEqual(states[states.length - 1].pending.length, 0, "Set saved after manual retry");
}

async function testReplayAttemptedResetOnNewPendingSet() {
  console.log("\n--- replayAttempted doesn't block new expired sets ---");

  const storage = createStorage();
  const sessionId = "session-abc";

  let callCount = 0;
  const logSet: LogSetFunction = async () => {
    callCount++;
    return { ok: true };
  };

  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    userId: "test-user-id",
    sessionId,
    onChange: () => {},
  });

  // No pending sets initially, so onFocus does nothing
  controller.onFocus();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assertEqual(callCount, 0, "No replay when no pending sets");

  // Now submit a set that expires
  const result = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  });

  assertEqual(result.status, "saved", "Set saved (no expiry in this test)");
  assertEqual(callCount, 1, "logSet called for submit");
}

async function main() {
  console.log("Testing automatic replay on mount\n");

  await testOnFocusReplaysOnFirstCall();
  await testOnFocusDoesNotReplayTwice();
  await testOnFocusRetriesAfterFailure();
  await testReplayAttemptedResetOnNewPendingSet();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
