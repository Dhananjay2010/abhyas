#!/usr/bin/env tsx
/**
 * Test: set_exists in submit returns 'saved'
 * 
 * Test that when submit gets a result with reason:'set_exists',
 * it treats it as a successful save (not as an error).
 */

import { createPendingSetController, type PendingSetState } from "../src/lib/session/pending-set-controller";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Result } from "../src/app/session/actions";

type Storage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createFakeStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
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
  const storage = createFakeStorage();
  const deps = createPendingSetDeps();
  
  // logSet returns set_exists
  const logSet = async () => {
    const result: Result & { reason?: string } = {
      ok: false,
      error: "Set already exists",
      reason: "set_exists",
    };
    return result;
  };

  let finalState: PendingSetState | null = null;
  const controller = createPendingSetController({
    userId: "user-1",
    deps,
    storage,
    logSet,
    sessionId: "sess-1",
    sessionStatus: "in_progress",
    onChange: (state) => { finalState = state; },
  });

  const result = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    clientId: "set-1",
  });

  check("Submit with set_exists returns 'saved'", result.status === "saved");
  check("No error set in state", finalState?.error === null);
  check("Not marked as expired", finalState?.expired === false);
  check("No pending sets saved", finalState?.pending.length === 0);
}

runTest().then(() => {
  console.log(exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed");
  process.exit(exitCode);
});
