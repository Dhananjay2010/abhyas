#!/usr/bin/env tsx
/**
 * Test: Conflict notice for replayed sets
 * 
 * Verifies that when a queued set conflicts (set number already recorded
 * with different values), it's dropped from the queue and a visible notice
 * is shown to the user.
 */

import { createPendingSetController, type LogSetFunction } from "../src/lib/session/pending-set-controller";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function createFakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => {
      const keys = Array.from(data.keys());
      return keys[index] ?? null;
    },
    get length() {
      return data.size;
    },
  };
}

async function testConflictNotice() {
  console.log("\n▶ Testing conflict notice for replayed sets...");

  const storage = createFakeStorage();
  const now = 1000000;
  let logSetAttempts = 0;

  const logSet: LogSetFunction = async (input) => {
    logSetAttempts += 1;
    if (logSetAttempts === 1) {
      // First attempt: network failure, set will be queued
      throw new TypeError("Failed to fetch");
    }
    // Second attempt: conflict - set number already exists with different values
    return {
      ok: false,
      reason: "set_exists",
      savedSets: [
        {
          setNumber: input.setNumber,
          reps: 8,  // Different from the queued reps: 10
          weightKg: 90,  // Different from the queued weight: 100
          durationSeconds: null,
        },
      ],
    };
  };

  const states: Array<{ pending: number; conflicts: number }> = [];

  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({ pending: state.pending.length, conflicts: state.conflicts });
    },
    deps: createPendingSetDeps(() => now),
  });

  controller.load();

  // Submit a set that fails (network error)
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });

  assert(logSetAttempts === 1, "Should have attempted once");
  assert(states[states.length - 1].pending === 1, "Should have 1 pending set after network failure");
  assert(states[states.length - 1].conflicts === 0, "Should have 0 conflicts initially");

  // Replay the set (will conflict)
  controller.load();
  await controller.replay();

  assert(logSetAttempts === 2, "Should have retried");

  // Wait for promises to settle
  await new Promise(resolve => setTimeout(resolve, 10));

  const finalState = states[states.length - 1];
  assert(finalState.pending === 0, "Should have no pending sets after conflict (removed from queue)");
  assert(finalState.conflicts === 1, "Should have 1 conflict recorded");

  controller.cleanup();
  console.log("  ✓ Conflict detected and recorded");
  console.log("  ✓ Set removed from queue");
  console.log("  ✓ Conflict count incremented");
}

async function testMultipleConflicts() {
  console.log("\n▶ Testing multiple conflicts...");

  const storage = createFakeStorage();
  const now = 1000000;
  let attemptCount = 0;

  const logSet: LogSetFunction = async (input) => {
    attemptCount += 1;
    if (attemptCount <= 2) {
      // First two attempts: network failures
      throw new TypeError("Failed to fetch");
    }
    // Replay attempts: both conflict
    return {
      ok: false,
      reason: "set_exists",
      savedSets: [
        {
          setNumber: input.setNumber,
          reps: 5,
          weightKg: 80,
          durationSeconds: null,
        },
      ],
    };
  };

  const states: Array<{ pending: number; conflicts: number }> = [];

  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({ pending: state.pending.length, conflicts: state.conflicts });
    },
    deps: createPendingSetDeps(() => now),
  });

  controller.load();

  // Submit two sets that fail
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });

  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 10,
    weightKg: 100,
    clientId: "client-2",
  });

  assert(states[states.length - 1].pending === 2, "Should have 2 pending sets");
  assert(states[states.length - 1].conflicts === 0, "Should have 0 conflicts initially");

  // Replay both sets (both will conflict)
  controller.load();
  await controller.replay();

  // Wait for promises
  await new Promise(resolve => setTimeout(resolve, 10));

  const finalState = states[states.length - 1];
  assert(finalState.pending === 0, "Should have no pending sets after conflicts");
  assert(finalState.conflicts === 2, "Should have 2 conflicts recorded");

  controller.cleanup();
  console.log("  ✓ Multiple conflicts tracked correctly");
}

async function testDuplicateVsConflict() {
  console.log("\n▶ Testing duplicate (23505) vs conflict distinction...");

  const storage = createFakeStorage();
  const now = 1000000;
  let attemptCount = 0;

  const logSet: LogSetFunction = async (input) => {
    attemptCount += 1;
    if (attemptCount === 1) {
      throw new TypeError("Failed to fetch");
    }
    // Second attempt: duplicate (same values, 23505)
    return { ok: false, code: "23505", error: "duplicate key violation" };
  };

  const states: Array<{ pending: number; conflicts: number; replayed: number }> = [];

  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({
        pending: state.pending.length,
        conflicts: state.conflicts,
        replayed: state.replayed.length,
      });
    },
    deps: createPendingSetDeps(() => now),
  });

  controller.load();

  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });

  controller.load();
  await controller.replay();

  await new Promise(resolve => setTimeout(resolve, 10));

  const finalState = states[states.length - 1];
  assert(finalState.pending === 0, "Should have no pending sets after 23505 duplicate");
  assert(finalState.conflicts === 0, "Should have 0 conflicts for 23505 duplicate (same values)");
  assert(finalState.replayed === 1, "Should have 1 successfully replayed set");

  controller.cleanup();
  console.log("  ✓ 23505 duplicate treated as success, NOT as conflict");
}

console.log("Testing Conflict Notice");
console.log("=======================");

(async () => {
  try {
    await testConflictNotice();
    await testMultipleConflicts();
    await testDuplicateVsConflict();

    console.log("\n✅ All conflict notice tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
})();
