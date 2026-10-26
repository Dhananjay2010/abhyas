#!/usr/bin/env tsx
/**
 * Test: SignOutButton clears pending sets before signing out
 */

import "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";
import { savePendingSet, clearAllPendingSetsForUser } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Storage } from "../src/lib/session/pending-set-retry";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

// Fake localStorage for testing
class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  
  get length() {
    return this.data.size;
  }
  
  clear(): void {
    this.data.clear();
  }
  
  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }
  
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }
  
  removeItem(key: string): void {
    this.data.delete(key);
  }
  
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const fakeStorage = new FakeStorage();

// Override window.localStorage globally
Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

(async () => {
  console.log("\n📋 Test: SignOutButton clears pending sets before sign out\n");
  
  const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();
  const fakeDeps: PendingSetDeps = {
    now: () => FIXED_TIME,
  };
  
  const callOrder: string[] = [];
  
  // Seed storage with pending sets for u1 and u2
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u1", "session-1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u1"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, "u2", "session-2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 12,
    weightKg: 60,
    durationSeconds: null,
    clientId: "pending-u2"
  }, fakeDeps);
  
  // Verify both keys exist before
  assert(fakeStorage.getItem("pending-sets:u1") !== null, "u1 pending sets exist before");
  assert(fakeStorage.getItem("pending-sets:u2") !== null, "u2 pending sets exist before");
  
  const clearSets = (storage: Storage, userId: string) => {
    callOrder.push("clearSets");
    assert(userId === "u1", "clearSets called with correct userId u1");
    clearAllPendingSetsForUser(storage, userId);
  };
  
  // Success case: signOut returns success (in real code it would redirect on client)
  const signOutSuccess = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    callOrder.push("signOut");
    return { ok: true };
  };
  
  render(
    <SignOutButton
      userId="u1"
      clearSets={clearSets}
      signOut={signOutSuccess}
    />
  );
  
  await act(async () => {
    const button = screen.getByRole("button");
    button.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // New behavior: signOut called first, clearSets called after success
  assert(callOrder[0] === "signOut", "4b: signOut called first");
  assert(callOrder[1] === "clearSets", "4c: clearSets called after signOut success");
  
  // Verify u1 pending sets are removed
  assert(fakeStorage.getItem("pending-sets:u1") === null, "4b: u1 pending sets removed");
  
  // Verify u2 pending sets still exist
  assert(fakeStorage.getItem("pending-sets:u2") !== null, "4b: u2 pending sets kept");
  
  // F8: Test that queue is NOT cleared when sign-out fails
  console.log("\n--- Testing F8: Queue stays on failure ---\n");
  
  fakeStorage.clear();
  const queueData = JSON.stringify({
    version: 1,
    timestamp: FIXED_TIME,
    sets: [{
      sessionExerciseId: "ex3",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u3"
    }]
  });
  fakeStorage.setItem("pending-sets:u3", queueData);
  
  const clearSetsF8 = (storage: Storage, userId: string) => {
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutFailure = async () => {
    return { ok: false as const, error: "Sign-out failed" };
  };
  
  render(
    <SignOutButton
      userId="u3"
      clearSets={clearSetsF8}
      signOut={signOutFailure}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Queue should NOT be cleared when sign-out fails
  const remainingQueue = fakeStorage.getItem("pending-sets:u3");
  assert(remainingQueue !== null, "F8: Queue stays when sign-out fails");
  assert(remainingQueue === queueData, "F8: Queue unchanged on failure");
  
  console.log("\nPLANTED BUG: Clearing queue before checking sign-out result → data loss\n");
  
  console.log(`\n✅ SignOutButton test passed (${passed}/${passed + failed})\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
