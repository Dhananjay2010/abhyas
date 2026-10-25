#!/usr/bin/env tsx
const FIXED_TIME = 1700000000000; // Nov 14, 2023
/**
 * Test: set_exists in submit counts as saved
 * 
 * Verifies that when submit returns reason:'set_exists',
 * it's treated as success (saved) not as an error.
 */

import { createPendingSetController } from "../src/lib/session/pending-set-controller";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import { loadPendingSets, type Storage } from "../src/lib/session/pending-set-retry";
import type { Result } from "../src/app/session/actions";

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

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting set_exists in submit\n");

async function runTest() {
  const storage = createStorage();
  const deps = createPendingSetDeps(FIXED_TIME);
  const userId = "user-1";
  const sessionId = "sess-1";
  
  // logSet returns set_exists
  const logSet = async (): Promise<Result & { reason?: string }> => {
    return {
      ok: false,
      error: "Set already exists",
      reason: "set_exists",
    };
  };

  const controller = createPendingSetController({
    userId,
    deps,
    storage,
    logSet,
    sessionId,
    sessionStatus: "in_progress",
    onChange: (state) => { 
      // onChange callback intentionally unused for this test
      void state;
    },
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    clientId: "set-1",
  });

  check("Submit with set_exists returns 'saved'", result.status === "saved");
  
  // Verify nothing in storage (set_exists means it was already saved, so don't queue it)
  const remaining = loadPendingSets(storage, userId, sessionId, deps);
  check("No pending sets in storage", remaining.length === 0);
}

runTest().then(() => {
  console.log(exitCode === 0 ? "\n✅ All set_exists submit tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
});
