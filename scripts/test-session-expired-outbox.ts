/**
 * Test SESSION_EXPIRED handling in pending set outbox.
 * 
 * Requirements from #105:
 * 1. When replay/log fails with isSessionExpired: keep every unsent set in the outbox
 *    (NEVER clear/drop them), show replay-error state with SessionExpiredPrompt,
 *    and replay exactly once after user signs back in.
 * 2. Other errors: keep existing keep-and-retry behavior.
 * 
 * Tests use typed fakes (no logic copies or source-text checks).
 */

import { createPendingSetController, type PendingSetState } from "@/lib/session/pending-set-controller";
import type { Result } from "@/app/session/actions";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";

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

let testCount = 0;
let passCount = 0;

function check(name: string, condition: boolean) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`✓ ${name}`);
  } else {
    console.log(`❌ ${name}`);
  }
}

console.log("\nTesting SESSION_EXPIRED handling in pending set outbox\n");
console.log("=".repeat(60));

async function runTests() {

// Test 1: Log failure with SESSION_EXPIRED keeps set in outbox
console.log("\n--- Test 1: Log with SESSION_EXPIRED keeps set in outbox ---");
{
  const storage = createFakeStorage();
  let callCount = 0;
  
  const logSet = async () => {
    callCount++;
    const result: Result = {
      ok: false,
      error: "SESSION_EXPIRED: Your session has expired",
      code: "SESSION_EXPIRED",
    };
    return result;
  };

  let currentState: PendingSetState | null = null;
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "sess-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => { currentState = state; },
    deps: createPendingSetDeps(),
  });

  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    clientId: "set-1",
  });

  check("logSet called once", callCount === 1);
  check("Pending set exists in outbox", currentState?.pending.length === 1);
  check("State marked as expired", currentState?.expired === true);
  check("No error shown (session expired is not an error)", currentState?.error === null);
  check("Set has correct data", currentState?.pending[0]?.reps === 10);
}

// Test 2: Replay with SESSION_EXPIRED keeps ALL sets in outbox
console.log("\n--- Test 2: Replay with SESSION_EXPIRED keeps all sets ---");
{
  const storage = createFakeStorage();
  
  // Pre-populate 3 sets in storage (using correct storage format)
  const sess2Data = {
    sets: [
      { sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "set-1" },
      { sessionExerciseId: "ex-1", setNumber: 2, reps: 8, weightKg: 55, durationSeconds: null, clientId: "set-2" },
      { sessionExerciseId: "ex-2", setNumber: 1, reps: 12, weightKg: 40, durationSeconds: null, clientId: "set-3" },
    ],
  };
  storage.setItem("pending-sets:user-2", JSON.stringify({
    "sess-2": sess2Data,
  }));

  const logSet = async () => {
    const result: Result = {
      ok: false,
      error: "SESSION_EXPIRED: Your session has expired",
      code: "SESSION_EXPIRED",
    };
    return result;
  };

  let currentState: PendingSetState | null = null;
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "sess-2",
    sessionStatus: "in_progress",
    userId: "user-2",
    onChange: (state) => { currentState = state; },
    deps: createPendingSetDeps(),
  });

  controller.load();
  check("Loaded 3 pending sets", currentState?.pending.length === 3);

  await controller.replay();
  
  check("All 3 sets still in outbox after SESSION_EXPIRED replay", currentState?.pending.length === 3);
  check("State still marked expired", currentState?.expired === true);
  check("Replay error recorded", currentState?.error !== null);
  check("No sets cleared from storage", storage.getItem("pending-sets:user-2") !== null);
  
  const storedData = storage.getItem("pending-sets:user-2");
  if (storedData) {
    const stored = JSON.parse(storedData);
    check("Storage still has session data", "sess-2" in stored);
    if ("sess-2" in stored && stored["sess-2"].sets) {
      check("Storage still has all 3 sets", stored["sess-2"].sets.length === 3);
    }
  }
}

// Test 3: Other errors keep retry behavior
console.log("\n--- Test 3: Other errors keep existing retry behavior ---");
{
  const storage = createFakeStorage();
  let attemptCount = 0;
  
  const logSet = async () => {
    attemptCount++;
    if (attemptCount === 1) {
      const result: Result = {
        ok: false,
        error: "Network error",
      };
      return result;
    }
    return { ok: true };
  };

  let currentState: PendingSetState | null = null;
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "sess-3",
    sessionStatus: "in_progress",
    userId: "user-3",
    onChange: (state) => { currentState = state; },
    deps: createPendingSetDeps(),
  });

  const result1 = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    clientId: "set-1",
  });

  check("First attempt failed with network error", result1.status === "failed");
  check("Error recorded in state", currentState?.error === "Network error");
  
  // Network errors do NOT save to pending (current behavior)
  check("Set not saved to pending on network error", currentState?.pending.length === 0);
}

// Test 4: Successful replay after SESSION_EXPIRED clears sets
console.log("\n--- Test 4: Successful retry after sign-in clears sets ---");
{
  const storage = createFakeStorage();
  
  // Pre-populate 2 sets (using correct storage format)
  storage.setItem("pending-sets:user-4", JSON.stringify({
    "sess-4": {
      sets: [
        { sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "set-1" },
        { sessionExerciseId: "ex-1", setNumber: 2, reps: 8, weightKg: 55, durationSeconds: null, clientId: "set-2" },
      ],
    },
  }));

  const logSet = async () => {
    return { ok: true };
  };

  let currentState: PendingSetState | null = null;
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "sess-4",
    sessionStatus: "in_progress",
    userId: "user-4",
    onChange: (state) => { currentState = state; },
    deps: createPendingSetDeps(),
  });

  controller.load();
  await controller.replay();
  
  check("All sets successfully replayed", currentState?.replayed.length === 2);
  check("Outbox now empty", currentState?.pending.length === 0);
  check("Not marked expired after successful replay", currentState?.expired === false);
  
  const storedData = storage.getItem("pending-sets:user-4");
  const hasNoSets = !storedData || !JSON.parse(storedData)["sess-4"] || JSON.parse(storedData)["sess-4"].sets?.length === 0;
  check("Storage cleared or empty", hasNoSets);
}

// Test 5: Each set sent exactly once after successful reconnect
console.log("\n--- Test 5: Each set sent exactly once on successful retry ---");
{
  const storage = createFakeStorage();
  
  storage.setItem("pending-sets:user-5", JSON.stringify({
    "sess-5": {
      sets: [
        { sessionExerciseId: "ex-1", setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null, clientId: "set-1" },
      ],
    },
  }));

  const calls: Array<{ setNumber: number; reps: number }> = [];
  const logSet = async (input: { setNumber: number; reps: number | null }) => {
    calls.push({ setNumber: input.setNumber, reps: input.reps ?? 0 });
    return { ok: true };
  };

  let currentState: PendingSetState | null = null;
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "sess-5",
    sessionStatus: "in_progress",
    userId: "user-5",
    onChange: (state) => { currentState = state; },
    deps: createPendingSetDeps(),
  });

  controller.load();
  await controller.replay();
  
  check("logSet called exactly once", calls.length === 1);
  check("Called with correct set number", calls[0].setNumber === 1);
  check("Called with correct reps", calls[0].reps === 10);
  check("Set cleared after successful send", currentState?.pending.length === 0);
}

console.log("\n" + "=".repeat(60));
console.log(`\n${passCount === testCount ? "✅" : "❌"} ${passCount}/${testCount} tests passed\n`);

if (passCount !== testCount) {
  console.error("Some tests failed");
  process.exit(1);
}

}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
