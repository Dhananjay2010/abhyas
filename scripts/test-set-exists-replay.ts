#!/usr/bin/env tsx
const FIXED_TIME = 1700000000000; // Nov 14, 2023
/**
 * Test: set_exists replay handling
 * 
 * Behavioral test verifying that a set_exists result from replay is treated as success:
 * - The pending set is cleared from storage
 * - No error is shown to the user
 * - The state reflects successful replay
 */

import { createPendingSetController, type PendingSetState } from "../src/lib/session/pending-set-controller";
import type { Result } from "../src/app/session/actions";
import { savePendingSet, loadPendingSets, storageKey, type Storage } from "../src/lib/session/pending-set-retry";
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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Testing set_exists replay handling\n");

async function main() {
  const storage = createStorage();
  const deps = createPendingSetDeps(FIXED_TIME);
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

  // Verify it's stored
  const beforeReplay = loadPendingSets(storage, userId, sessionId, deps);
  assertEqual(beforeReplay.length, 1, "Pending set exists before replay");

  // Replay with set_exists response (server says "already exists")
  const logSet = async (): Promise<Result & { reason?: string }> => {
    return {
      ok: false,
      error: "Set already exists",
      reason: "set_exists",
    };
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

  await controller.replay();

  // Verify it's treated as success
  const afterReplay = loadPendingSets(storage, userId, sessionId, deps);
  assertEqual(afterReplay.length, 0, "Pending set cleared after set_exists replay");

  const finalState = states[states.length - 1];
  assert(!finalState.error, "No error shown after set_exists replay");
  assert(!finalState.expired, "Not marked as expired after set_exists replay");
  assertEqual(finalState.pending.length, 0, "Pending array is empty");

  // Verify storage is clean
  const storageValue = storage.getItem(storageKey(userId));
  const parsed = storageValue ? JSON.parse(storageValue) : {};
  assert(!parsed[sessionId] || parsed[sessionId].length === 0, "Storage cleaned for this session");

  console.log(exitCode === 0 ? "\n✅ All set_exists tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
}

main();
