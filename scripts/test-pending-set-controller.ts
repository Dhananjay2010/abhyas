/**
 * Test pending-set controller - catches all mutants.
 */

import {
  createPendingSetController,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE, resolveAuth } from "../src/lib/session/auth-result";
import type { Result } from "../src/app/session/actions";
import type { Storage } from "../src/lib/session/pending-set-retry";

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

async function testMutantC_RapidFocusAndReplay() {
  console.log("\n--- Mutant (c): Rapid onFocus + replay calls logSet once per set ---");

  const storage = createStorage();
  const sessionId = "session-123";

  storage.setItem(
    "pending-sets",
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
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId,
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

async function testMutantD_PrefilledStorage() {
  console.log("\n--- Mutant (d): Pre-filled storage loads and replays ---");

  const storage = createStorage();
  const sessionId = "session-456";

  storage.setItem(
    "pending-sets",
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
    storage,
    logSet,
    sessionId,
    onChange: (state) => states.push(state),
  });

  assert(states[0].pending.length === 1, "Pending set loaded from storage on construct");
  assert(states[0].expired, "Expired flag set when pending sets exist");

  await controller.replay();

  assert(called, "logSet called during replay");
  assert(
    states[states.length - 1].pending.length === 0,
    "Pending set cleared after replay"
  );
}

async function testMutantE_UnresolvedPromise() {
  console.log("\n--- Mutant (e): Unresolved promise doesn't mark as saved ---");

  const storage = createStorage();
  const sessionId = "session-789";

  let resolveLogSet!: (value: Result) => void;
  const logSet: LogSetFunction = () => {
    return new Promise<Result>((resolve) => {
      resolveLogSet = resolve;
    });
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId,
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

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert(!states.some((s) => s.pending.length === 0), "Not marked as saved while promise unresolved");

  resolveLogSet({ ok: true });

  const result = await submitPromise;
  assertEqual(result.status, "saved", "Marked as saved only after promise resolves");
}

async function testMutantF_ServerSideAuth() {
  console.log("\n--- Mutant (f): Server-side auth returns code, doesn't throw ---");

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

async function testMutantG_ReplayGuard() {
  console.log("\n--- Mutant (g): Single-flight guard prevents concurrent replays ---");

  const storage = createStorage();
  const sessionId = "session-999";

  storage.setItem(
    "pending-sets",
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { ok: true };
  };

  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId,
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
    storage,
    logSet,
    sessionId,
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
    "pending-sets",
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
    storage,
    logSet,
    sessionId,
    onChange: () => {},
  });

  await controller.replay();

  const remaining = storage.getItem("pending-sets");
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
    storage,
    logSet,
    sessionId,
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

async function main() {
  console.log("Testing pending-set controller (mutant-killing tests)\n");

  await testMutantC_RapidFocusAndReplay();
  await testMutantD_PrefilledStorage();
  await testMutantE_UnresolvedPromise();
  await testMutantF_ServerSideAuth();
  await testMutantG_ReplayGuard();
  await testSessionExpiredHandling();
  await testDuplicate23505();
  await testNetworkErrorKeepsPending();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
