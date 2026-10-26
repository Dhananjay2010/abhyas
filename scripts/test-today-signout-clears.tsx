#!/usr/bin/env tsx
/**
 * Test: Today SignOutForm clears queue only after success and navigates
 * 
 * Tests:
 * - Success: clears that user's queue (other users untouched), then navigates (M11, M14)
 * - Failure: keeps queue, no navigation
 * - Throw: keeps queue, no navigation
 * 
 * Mutants:
 * - M10: Clear before sign-out check
 * - M11: Today form not clearing at all
 * - M12: Clear when signOut throws
 * - M14: No navigation after success
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";
import { render, act, screen } from "@testing-library/react";
import { SignOutForm } from "../src/app/today/signout-form";
import { savePendingSet, clearAllPendingSetsForUser, storageKey } from "../src/lib/session/pending-set-retry";
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

const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };

(async () => {
  console.log("\n📋 Test: Today SignOutForm clears queue only after success\n");
  
  // Track router calls
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(Date.now());
  };
  
  // ========================================================================
  // Test 1: Success clears that user's queue, others untouched, then navigates (M11, M14)
  // ========================================================================
  console.log("=== Test 1: Success path (M11, M14) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u1", "s1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u1-set"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, "u2", "s2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 12,
    weightKg: 60,
    durationSeconds: null,
    clientId: "u2-set"
  }, fakeDeps);
  
  assert(fakeStorage.getItem(storageKey("u1")) !== null, "u1 queue exists");
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "u2 queue exists");
  
  const signOutSuccess = async () => {
    return { ok: true as const };
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u1"
      signOut={signOutSuccess}
      clearSets={clearAllPendingSetsForUser}
    />
  );
  
  await act(async () => {
    const button = screen.getByRole("button");
    button.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // M11: u1 queue should be cleared after success
  assert(fakeStorage.getItem(storageKey("u1")) === null, "M11: u1 queue cleared after success");
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "u2 queue kept (other user)");
  
  // M14: Navigation should happen after success
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "M14: router.replace('/') called once");
  assert(refreshCalls.length === 1, "M14: router.refresh() called once");
  
  console.log("✓ Test 1: Success path passed\n");
  
  // ========================================================================
  // Test 2: Failure keeps queue, no navigation (M10)
  // ========================================================================
  console.log("=== Test 2: Failure keeps queue ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u3", "s3", {
    sessionExerciseId: "ex3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u3-set"
  }, fakeDeps);
  
  const queueBefore = fakeStorage.getItem(storageKey("u3"));
  assert(queueBefore !== null, "u3 queue exists before sign-out");
  
  const signOutFailure = async () => {
    return { ok: false as const, error: "Sign-out failed" };
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u3"
      signOut={signOutFailure}
      clearSets={clearAllPendingSetsForUser}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  const queueAfter = fakeStorage.getItem(storageKey("u3"));
  assert(queueAfter !== null, "M10: u3 queue kept after failure");
  assert(queueAfter === queueBefore, "M10: u3 queue unchanged after failure");
  assert(replaceCalls.length === 0, "router.replace not called on failure");
  assert(refreshCalls.length === 0, "router.refresh not called on failure");
  
  console.log("✓ Test 2: Failure keeps queue\n");
  
  // ========================================================================
  // Test 3: Throw keeps queue, no navigation (M12)
  // ========================================================================
  console.log("=== Test 3: Throw keeps queue (M12) ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u4", "s4", {
    sessionExerciseId: "ex4",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u4-set"
  }, fakeDeps);
  
  const queueBeforeThrow = fakeStorage.getItem(storageKey("u4"));
  assert(queueBeforeThrow !== null, "u4 queue exists before sign-out");
  
  const signOutThrow = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    throw new Error("Network error");
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u4"
      signOut={signOutThrow}
      clearSets={clearAllPendingSetsForUser}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  const queueAfterThrow = fakeStorage.getItem(storageKey("u4"));
  assert(queueAfterThrow !== null, "M12: u4 queue kept after throw");
  assert(queueAfterThrow === queueBeforeThrow, "M12: u4 queue unchanged after throw");
  assert(replaceCalls.length === 0, "M12: router.replace not called when thrown");
  assert(refreshCalls.length === 0, "M12: router.refresh not called when thrown");
  
  console.log("✓ Test 3: Throw keeps queue\n");
  
  console.log(`✅ Today SignOutForm tests passed (${passed} assertions)\n`);
  console.log("MUTANT M10: Clear before sign-out check → clears even on failure");
  console.log("MUTANT M11: Today form not clearing → queue never cleared");
  console.log("MUTANT M12: Clear when signOut throws → kills the queue");
  console.log("MUTANT M14: No navigation after success → user stays on /today\n");
  process.exit(0);
})();
