/**
 * Test that replay plus next set never overwrites a set.
 * 
 * Scenario: A set expires and becomes pending. Before replay completes,
 * the user logs another set. The nextSetNumber must advance past any
 * pending set numbers to prevent collisions.
 */

import {
  createPendingSetController,
  type LogSetFunction,
  type PendingSetState,
} from "../src/lib/session/pending-set-controller";
import { SESSION_EXPIRED_CODE } from "../src/lib/session/auth-result";
import type { Storage } from "../src/lib/session/pending-set-retry";
import { nextSetNumberFor } from "../src/lib/session/next-set-number";

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

async function testReplayPlusNextSetNoCollision() {
  console.log("\n--- Replay + next set never reuse set_number ---");

  const storage = createStorage();
  const sessionId = "session-123";
  const exerciseId = "ex-1";

  const loggedSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; success: boolean }> = [];
  
  const logSet: LogSetFunction = async (input) => {
    // First call: session expired
    if (loggedSets.length === 0) {
      loggedSets.push({ setNumber: input.setNumber, reps: input.reps, weightKg: input.weightKg, success: false });
      return {
        ok: false,
        error: "Not signed in",
        code: SESSION_EXPIRED_CODE,
      };
    }
    // Subsequent calls: success
    loggedSets.push({ setNumber: input.setNumber, reps: input.reps, weightKg: input.weightKg, success: true });
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    onChange: (state) => states.push(state),
  });

  // Step 1: Submit set 1, which expires
  const result1 = await controller.submit({
    sessionExerciseId: exerciseId,
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  });

  assertEqual(result1.status, "expired", "Set 1 expired");
  assert(
    states[states.length - 1].pending.length === 1,
    "Set 1 is pending"
  );

  const setsInUI = 0;
  const pendingCount = states[states.length - 1].pending.filter(
    (s) => s.sessionExerciseId === exerciseId
  ).length;
  const correctNextSetNumber = nextSetNumberFor(setsInUI, pendingCount);

  console.log(`  Current sets: ${setsInUI}, Pending: ${pendingCount}`);
  console.log(`  Next set number (accounting for pending): ${correctNextSetNumber}`);

  // Step 3: Replay the pending set (async, doesn't block UI)
  const replayPromise = controller.replay();

  await controller.submit({
    sessionExerciseId: exerciseId,
    setNumber: correctNextSetNumber,
    reps: 12,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-2",
  });

  await replayPromise;

  // Check what was actually saved (successful calls only)
  const successfulSets = loggedSets.filter((s) => s.success);
  const uniqueSetNumbers = new Set(successfulSets.map((s) => s.setNumber));
  
  console.log(`  All attempts: ${JSON.stringify(loggedSets.map(s => ({ setNumber: s.setNumber, reps: s.reps, success: s.success })))}`);
  console.log(`  Successful saves: ${JSON.stringify(successfulSets.map(s => ({ setNumber: s.setNumber, reps: s.reps })))}`);
  console.log(`  Unique set numbers (successful): ${Array.from(uniqueSetNumbers).sort().join(", ")}`);

  // The test passes if all successful set numbers are unique
  assert(
    uniqueSetNumbers.size === successfulSets.length,
    `All successful set numbers must be unique (got ${successfulSets.length} successful with ${uniqueSetNumbers.size} unique numbers)`
  );
  
  // Verify we saved exactly 2 distinct sets
  assertEqual(successfulSets.length, 2, "Saved exactly 2 sets");
  assert(uniqueSetNumbers.has(1), "Set 1 was saved");
  assert(uniqueSetNumbers.has(2), "Set 2 was saved");
}

async function testPendingSetCountPerExercise() {
  console.log("\n--- Count pending sets per exercise ---");

  const storage = createStorage();
  const sessionId = "session-123";

  const logSet: LogSetFunction = async () => ({
    ok: false,
    error: "Not signed in",
    code: SESSION_EXPIRED_CODE,
  });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    onChange: (state) => states.push(state),
  });

  // Log sets for two different exercises
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  });

  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-2",
  });

  await controller.submit({
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 8,
    weightKg: 40,
    durationSeconds: null,
    clientId: "client-3",
  });

  const finalState = states[states.length - 1];
  const ex1Pending = finalState.pending.filter((s) => s.sessionExerciseId === "ex-1");
  const ex2Pending = finalState.pending.filter((s) => s.sessionExerciseId === "ex-2");

  assertEqual(ex1Pending.length, 2, "Exercise 1 has 2 pending sets");
  assertEqual(ex2Pending.length, 1, "Exercise 2 has 1 pending set");
  assertEqual(finalState.pending.length, 3, "Total 3 pending sets");
}

async function testReplayedSetsUpdateUI() {
  console.log("\n--- After replay, replayed array allows UI to update sets ---");

  const storage = createStorage();
  const sessionId = "session-123";

  // Pre-fill storage with pending sets
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

  const logSet: LogSetFunction = async () => ({ ok: true });

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    deps: createPendingSetDeps(),
    storage,
    logSet,
    sessionId,
    onChange: (state) => states.push(state),
  });

  await controller.replay();

  const finalState = states[states.length - 1];
  
  assertEqual(finalState.replayed.length, 2, "Both sets reported as replayed");
  assertEqual(finalState.pending.length, 0, "No sets remain pending");
  
  const maxSetNumber = Math.max(...finalState.replayed.map((s) => s.setNumber));
  const correctNextSetNumber = nextSetNumberFor(maxSetNumber, 0);
  
  assertEqual(correctNextSetNumber, 3, "After replaying sets 1 and 2, nextSetNumber should be 3");
}

async function main() {
  console.log("Testing replay + next set collision\n");

  await testReplayPlusNextSetNoCollision();
  await testPendingSetCountPerExercise();
  await testReplayedSetsUpdateUI();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
