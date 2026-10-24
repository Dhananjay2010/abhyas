#!/usr/bin/env tsx
/**
 * Test: SESSION_EXPIRED outbox behavior
 * 
 * Verifies that when submit/replay fails with isSessionExpired:
 * - Unsent sets stay in the outbox (not discarded)
 * - SessionExpiredPrompt is shown
 * - After sign-in, replay happens exactly once
 */

import { createPendingSetController, type PendingSetState } from "../src/lib/session/pending-set-controller";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import { loadPendingSets, savePendingSet, type Storage } from "../src/lib/session/pending-set-retry";
import type { Result } from "../src/app/session/actions";

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

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting SESSION_EXPIRED outbox behavior\n");

async function runTest() {
  const storage = createStorage();
  const deps = createPendingSetDeps();
  const userId = "user-1";
  const sessionId = "sess-1";
  
  let callCount = 0;
  let shouldExpire = true;
  
  // logSet returns SESSION_EXPIRED on first calls, then success
  const logSet = async (): Promise<Result> => {
    callCount++;
    if (shouldExpire) {
      return {
        ok: false,
        error: "SESSION_EXPIRED: Session expired",
        code: "SESSION_EXPIRED",
      };
    }
    return { ok: true };
  };

  const states: PendingSetState[] = [];
  const controller = createPendingSetController({
    userId,
    deps,
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => states.push(state),
  });

  // Submit a set - should fail with SESSION_EXPIRED
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    clientId: "set-1",
  });

  // Verify set is in outbox
  const outbox1 = loadPendingSets(storage, userId, sessionId, deps);
  check("Set saved to outbox after SESSION_EXPIRED", outbox1.length === 1);

  // Verify expired flag is set
  const state1 = states[states.length - 1];
  check("State marked as expired", state1.expired === true);
  check("Pending count is 1", state1.pending.length === 1);

  // Simulate sign-in: allow success
  shouldExpire = false;
  const beforeReplayCount = callCount;

  // Trigger replay (simulates focus after sign-in)
  await controller.replay();

  // Verify exactly one replay attempt
  const replayAttempts = callCount - beforeReplayCount;
  check("Replay called exactly once", replayAttempts === 1);

  // Verify set cleared from outbox
  const outbox2 = loadPendingSets(storage, userId, sessionId, deps);
  check("Set cleared from outbox after successful replay", outbox2.length === 0);

  // Verify state shows successful replay
  const state2 = states[states.length - 1];
  check("State no longer marked as expired after success", state2.expired === false);
  check("No error in state", state2.error === null);
  check("Set in replayed list", state2.replayed.length === 1);
}

runTest().then(() => {
  console.log(exitCode === 0 ? "\n✅ All SESSION_EXPIRED outbox tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
});
