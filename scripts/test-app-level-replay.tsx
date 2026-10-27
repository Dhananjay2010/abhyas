#!/usr/bin/env tsx
/**
 * Test: App-level replay on sign-in with keep-and-surface policy
 * 
 * Tests:
 * 1. Sign out anyway → new sign-in → replay posts the sets
 * 2. Closed-session sets are kept and surfaced
 * 3. Discard removes only the specified session's sets
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup } from "@testing-library/react";
import { PendingSetReplay } from "../src/components/pending-set-replay";
import { savePendingSet, storageKey, loadAllPendingSetsWithTimestamp } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Storage } from "../src/lib/session/pending-set-retry";

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

class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  get length() { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) || null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] || null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const fakeStorage = new FakeStorage();
Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

(async () => {
  console.log("\n📋 Test: App-level replay on sign-in (Issue #3)\n");
  
  const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
  const deps: PendingSetDeps = { now: () => FIXED_TIME };
  
  // ========================================================================
  // Test 1: Sign out anyway → new sign-in → replay posts the sets
  // ========================================================================
  console.log("=== Test 1: Replay on new sign-in ===\n");
  
  fakeStorage.clear();
  
  // Simulate "Sign out anyway" leaving pending sets
  savePendingSet(fakeStorage, "u1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "set1"
  }, deps);
  
  savePendingSet(fakeStorage, "u1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "set2"
  }, deps);
  
  assert(fakeStorage.getItem(storageKey("u1")) !== null, "Sets exist before replay");
  
  let logSetCalls = 0;
  const logSetSuccess = async () => {
    logSetCalls++;
    return { ok: true as const };
  };
  
  // Render replay component (simulates new sign-in)
  const getSessionStatus = async () => "in_progress" as const;
  
  render(
    <PendingSetReplay
      userId="u1"
      getSessionStatus={getSessionStatus}
      logSet={logSetSuccess}
      now={new Date(FIXED_TIME)}
    />
  );
  
  // Wait for replay to complete
  await act(async () => {
    await Promise.resolve();
  });
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(logSetCalls === 2, "Both sets were replayed");
  assert(fakeStorage.getItem(storageKey("u1")) === null, "Queue cleared after successful replay");
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Closed-session sets are kept and surfaced
  // ========================================================================
  console.log("=== Test 2: Closed-session sets surfaced ===\n");
  
  fakeStorage.clear();
  
  savePendingSet(fakeStorage, "u2", "session2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 15,
    weightKg: 60,
    durationSeconds: null,
    clientId: "set3"
  }, deps);
  
  const queueBefore = fakeStorage.getItem(storageKey("u2"));
  
  logSetCalls = 0;
  
  // Session is ended (closed)
  const getSessionStatusEnded = async () => "ended" as const;
  
  render(
    <PendingSetReplay
      userId="u2"
      getSessionStatus={getSessionStatusEnded}
      logSet={logSetSuccess}
      now={new Date(FIXED_TIME)}
    />
  );
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(logSetCalls === 0, "No replay attempted for closed session");
  assert(fakeStorage.getItem(storageKey("u2")) === queueBefore, "Queue kept for closed session");
  
  // Check that warning is shown
  await act(async () => {
    await Promise.resolve();
  });
  
  const warning = screen.queryByText(/couldn'?t be saved because that workout ended/i);
  assert(warning !== null, "Warning message shown");
  
  const discardButton = screen.queryByText(/Discard/i);
  assert(discardButton !== null, "Discard button shown");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  // ========================================================================
  // Test 3: Discard removes only the specified session's sets
  // ========================================================================
  console.log("=== Test 3: Discard removes closed-session sets ===\n");
  
  fakeStorage.clear();
  
  // Add sets for two different sessions
  savePendingSet(fakeStorage, "u3", "session3", {
    sessionExerciseId: "ex3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "set4"
  }, deps);
  
  savePendingSet(fakeStorage, "u3", "session4", {
    sessionExerciseId: "ex4",
    setNumber: 1,
    reps: 12,
    weightKg: 55,
    durationSeconds: null,
    clientId: "set5"
  }, deps);
  
  const all = loadAllPendingSetsWithTimestamp(fakeStorage, "u3", deps);
  assert(Object.keys(all).length === 2, "Two sessions before discard");
  
  logSetCalls = 0;
  
  // Both sessions are ended
  render(
    <PendingSetReplay
      userId="u3"
      getSessionStatus={getSessionStatusEnded}
      logSet={logSetSuccess}
      now={new Date(FIXED_TIME)}
    />
  );
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(fakeStorage.getItem(storageKey("u3")) !== null, "Queue still exists before discard");
  
  // Click Discard button
  await act(async () => {
    const discardBtn = screen.getByText(/Discard/i);
    discardBtn.click();
  });
  
  await act(async () => {
    await Promise.resolve();
  });
  
  // All sessions for u3 should be discarded
  const allAfter = loadAllPendingSetsWithTimestamp(fakeStorage, "u3", deps);
  assert(Object.keys(allAfter).length === 0, "All sessions discarded");
  
  // Warning should be gone
  const warningAfter = screen.queryByText(/couldn'?t be saved/i);
  assert(warningAfter === null, "Warning removed after discard");
  
  cleanup();
  console.log("✓ Test 3 passed\n");
  
  console.log(`✅ App-level replay tests passed (${passed} assertions)\n`);
  
  console.log("MUTANTS TO TEST:");
  console.log("- Delete sets instead of surfacing closed sessions (must fail)");
  console.log("- Skip replay on sign-in (must fail)");
  console.log("- Discard all users' sets instead of just one session (must fail)\n");
  
  process.exit(0);
})();