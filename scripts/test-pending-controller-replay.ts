#!/usr/bin/env tsx
/**
 * Behavioral test for R4/R4s: Pending set controller must show error state
 * after failed replay, and clicking Retry must trigger replay again.
 */

import { createPendingSetController } from "../src/lib/session/pending-set-controller";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test R4/R4s: Controller replay after failure\n");

// Typed fake Storage
class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  
  get length(): number {
    return this.data.size;
  }
  
  clear(): void {
    this.data.clear();
  }
  
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  
  key(index: number): string | null {
    const keys = Array.from(this.data.keys());
    return keys[index] ?? null;
  }
  
  removeItem(key: string): void {
    this.data.delete(key);
  }
  
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

async function runTests() {
  try {
    const fakeStorage = new FakeStorage();
    const fakeDeps: PendingSetDeps = {
      now: () => Date.now(),
    };

    let logSetCallCount = 0;
    let lastState: { pending: unknown[]; error: string | null } = { pending: [], error: null };

    const mockLogSet = async () => {
      logSetCallCount++;
      // First call fails
      if (logSetCallCount === 1) {
        return { ok: false as const, error: "Network failure" };
      }
      // Second call succeeds
      return { ok: true as const };
    };

    // Save a pending set
    const userId = "test-user";
    const sessionId = "test-session";
    savePendingSet(fakeStorage, userId, sessionId, {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "client-1",
    }, fakeDeps);

    // Create controller
    const controller = createPendingSetController({
      storage: fakeStorage,
      logSet: mockLogSet,
      sessionId,
      sessionStatus: "in_progress",
      userId,
      onChange: (state) => {
        lastState = state;
      },
      deps: fakeDeps,
    });

    // Load pending sets
    controller.load();
    
    assert(lastState.pending.length === 1, "R4: Loaded 1 pending set");

    // Trigger replay (this will fail)
    await controller.replay();

    assert(logSetCallCount === 1, "R4: First replay attempt made");
    assert(lastState.error !== null, "R4: Error state set after failed replay");
    assert(lastState.pending.length === 1, "R4: Pending set still present after failure");

    // Trigger replay again (user clicks Retry button)
    await controller.replay();

    assert(logSetCallCount === 2, "R4s: Second replay attempt made after clicking Retry");
    assert(lastState.error === null, "R4s: Error cleared after successful replay");
    assert(lastState.pending.length === 0, "R4s: Pending set cleared after success");

    console.log(`\n✅ All assertions passed (${passed})`);
    console.log("\nMutation R4/R4s killed: Controller shows error and Retry triggers replay");
    console.log("Break: Removing error state or replay call breaks retry flow");
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Test failed: ${e}`);
    process.exit(1);
  }
}

runTests();
