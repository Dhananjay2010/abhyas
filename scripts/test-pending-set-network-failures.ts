#!/usr/bin/env tsx
/**
 * Test: Pending set controller with network failures
 * 
 * Verifies that the controller queues sets when network failures occur
 * (TypeError: Failed to fetch, navigator.onLine false) and retries them
 * with the backoff schedule.
 */

import { createPendingSetController, type LogSetFunction } from "../src/lib/session/pending-set-controller";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { RetryTimer } from "../src/lib/session/pending-set-retry-scheduler";

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

function createFakeTimer(): RetryTimer & {
  tick: (ms: number) => void;
  pendingCount: () => number;
} {
  const callbacks: Array<{ callback: () => void; id: number; fireAt: number }> = [];
  let nextId = 1;
  let currentTime = 0;

  return {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.push({ callback, id, fireAt: currentTime + ms });
      return id;
    },
    clearTimeout: (id: number | NodeJS.Timeout) => {
      const index = callbacks.findIndex((c) => c.id === id);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    },
    tick: (ms: number) => {
      currentTime += ms;
      const toFire = callbacks.filter((c) => c.fireAt <= currentTime);
      toFire.forEach((c) => {
        const index = callbacks.indexOf(c);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }
        c.callback();
      });
    },
    pendingCount: () => callbacks.length,
  };
}

async function testNetworkFailureQueued() {
  console.log("\n▶ Testing network failure queues set...");

  const storage = createFakeStorage();
  const timer = createFakeTimer();
  const now = 1000000;
  let logSetAttempts = 0;
  
  const logSet: LogSetFunction = async () => {
    logSetAttempts += 1;
    throw new TypeError("Failed to fetch");
  };

  const states: Array<PendingSetState> = [];
  const controller = createPendingSetController({
    storage,
    userId: "user-1",
    sessionId: "session-1",
    sessionStatus: "in_progress",
    logSet,
    onChange: (state) => {
      states.push(state);
    },
    deps: createPendingSetDeps(() => now),
    timer,
  });
  
  controller.load();
  
  const result = await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });
  
  assert(result.status === "expired", "Should return expired status (reusing expired flow for offline queue)");
  assert(states[states.length - 1].pending.length === 1, "Should have 1 pending set");
  assert(states[states.length - 1].error === null, "Should not show error for queued set");
  // Network failures set expired: false, unlike real SESSION_EXPIRED which sets expired: true
  assert(states[states.length - 1].expired === false, "Should NOT be marked as session-expired (only pending)");
  
  // Check storage
  const stored = storage.getItem("pending-sets:user-1");
  assert(stored !== null, "Should have saved to storage");
  if (stored) {
    const parsed = JSON.parse(stored);
    assert(parsed["session-1"].sets.length === 1, "Should have 1 set in storage");
    assert(parsed["session-1"].sets[0].clientId === "client-1", "Should have correct clientId");
  }  
  controller.cleanup();
  console.log("  ✓ Network failure (Failed to fetch) queues set");
}

async function testAutoRetryWithBackoff() {
  console.log("\n▶ Testing auto-retry with backoff...");

  const storage = createFakeStorage();
  const timer = createFakeTimer();
  const now = 1000000;
  let logSetAttempts = 0;
  
  const logSet: LogSetFunction = async () => {
    logSetAttempts += 1;
    if (logSetAttempts < 3) {
      throw new TypeError("Failed to fetch");
    }
    return { ok: true };
  };
  
  const states: Array<{ pending: number; retrying: boolean }> = [];
  
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({ pending: state.pending.length, retrying: state.retrying });
    },
    deps: createPendingSetDeps(() => now),
    timer,
  });
  
  controller.load();
  
  // Submit a set that fails
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });
  
  assert(logSetAttempts === 1, "Should have attempted once");
  assert(states[states.length - 1].pending === 1, "Should have 1 pending set");
  
  // Load triggers immediate replay (0ms backoff)
  controller.load();
  await controller.replay();
  
  assert(logSetAttempts === 2, "Should have retried immediately");
  assert(states[states.length - 1].pending === 1, "Should still have 1 pending set");
  
  // Wait for next retry (15s backoff)
  timer.tick(15000);
  await new Promise(resolve => setTimeout(resolve, 10)); // Let promises settle
  
  assert(logSetAttempts === 3, "Should have retried after 15s");
  
  // Wait a bit for promises to settle
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(states[states.length - 1].pending === 0, "Should have no pending sets after success");
  
  controller.cleanup();
  console.log("  ✓ Auto-retry with backoff: immediate, then 15s");
}

async function testOnlineEventTriggersRetry() {
  console.log("\n▶ Testing online event triggers immediate retry...");

  const storage = createFakeStorage();
  const timer = createFakeTimer();
  const now = 1000000;
  let logSetAttempts = 0;
  
  const logSet: LogSetFunction = async () => {
    logSetAttempts += 1;
    if (logSetAttempts === 1) {
      throw new TypeError("Failed to fetch");
    }
    return { ok: true };
  };
  
  const listeners = new Map<string, () => void>();
  const addEventListener = (type: string, handler: () => void) => {
    listeners.set(type, handler);
  };
  
  const removeEventListener = (type: string) => {
    listeners.delete(type);
  };
  
  const states: Array<{ pending: number }> = [];
  
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({ pending: state.pending.length });
    },
    deps: createPendingSetDeps(() => now),
    timer,
    addEventListener,
    removeEventListener,
  });
  
  controller.load();
  
  // Submit a set that fails
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });
  
  assert(logSetAttempts === 1, "Should have attempted once");
  assert(states[states.length - 1].pending === 1, "Should have 1 pending set");
  
  // Trigger online event
  const onlineHandler = listeners.get('online');
  assert(onlineHandler !== undefined, "Should have online handler");
  if (onlineHandler) {
    onlineHandler();
  }
  
  // Wait for promises to settle (replay is async)
  await new Promise(resolve => setTimeout(resolve, 100));
  
  assert(logSetAttempts === 2, "Should have retried immediately on online event");
  assert(states[states.length - 1].pending === 0, "Should have no pending sets after success");
  
  controller.cleanup();
  console.log("  ✓ Online event triggers immediate retry");
}

async function testDuplicateHandling() {
  console.log("\n▶ Testing duplicate handling (23505)...");

  const storage = createFakeStorage();
  const timer = createFakeTimer();
  const now = 1000000;
  let logSetAttempts = 0;
  
  const logSet: LogSetFunction = async () => {
    logSetAttempts += 1;
    if (logSetAttempts === 1) {
      throw new TypeError("Failed to fetch");
    }
    // Second attempt returns 23505
    return { ok: false, error: "Duplicate", code: "23505" };
  };
  
  const states: Array<{ pending: number; replayed: number }> = [];
  
  const controller = createPendingSetController({
    storage,
    logSet,
    sessionId: "session-1",
    sessionStatus: "in_progress",
    userId: "user-1",
    onChange: (state) => {
      states.push({ pending: state.pending.length, replayed: state.replayed.length });
    },
    deps: createPendingSetDeps(() => now),
    timer,
  });
  
  controller.load();
  
  // Submit a set that fails
  await controller.submit({
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    clientId: "client-1",
  });
  
  assert(logSetAttempts === 1, "Should have attempted once");
  assert(states[states.length - 1].pending === 1, "Should have 1 pending set");
  
  // Replay (immediate)
  controller.load();
  await controller.replay();
  
  assert(logSetAttempts === 2, "Should have retried");
  
  // Wait for promises
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const finalState = states[states.length - 1];
  assert(finalState.pending === 0, "Should have no pending sets (23505 treated as success)");
  assert(finalState.replayed === 1, "Should have 1 replayed set");
  
  controller.cleanup();
  console.log("  ✓ 23505 duplicate error treated as success");
}

console.log("Testing Pending Set Controller with Network Failures");
console.log("====================================================");

(async () => {
  try {
    await testNetworkFailureQueued();
    await testAutoRetryWithBackoff();
    await testOnlineEventTriggersRetry();
    await testDuplicateHandling();
    
    console.log("\n✅ All controller network failure tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
})();
