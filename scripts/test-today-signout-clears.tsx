#!/usr/bin/env tsx
/**
 * Test: Today SignOutForm with H1 behavior
 * 
 * H1: Sign-out never deletes unsynced sets.
 * Tests that SignOutForm follows H1 requirements.
 * (See test-signout-h1-never-delete.tsx for comprehensive H1 tests)
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";
import { render, act, screen } from "@testing-library/react";
import { SignOutForm } from "../src/app/today/signout-form";
import { savePendingSet, storageKey } from "../src/lib/session/pending-set-retry";
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
  console.log("\n📋 Test: SignOutForm H1 compatibility\n");
  
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(refreshCalls.length);
  };
  
  // ========================================================================
  // Test 1: Empty queue signs out immediately
  // ========================================================================
  console.log("=== Test 1: Empty queue signs out ===\n");
  
  fakeStorage.clear();
  
  const signOutSuccess = async () => {
    return { ok: true as const };
  };
  
  const logSetSuccess = async () => ({ ok: true as const });
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u1"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
    />
  );
  
  await act(async () => {
    const button = screen.getByRole("button");
    button.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "Navigates to / on empty queue");
  
  console.log("✓ Test 1: Empty queue passed\n");
  
  // ========================================================================
  // Test 2: Replay succeeds → queue removed, signs out
  // ========================================================================
  console.log("=== Test 2: Replay success ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u2", "s2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "u2-set"
  }, fakeDeps);
  
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "u2 queue exists before");
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u2"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u2")) === null, "u2 queue cleared after replay success");
  assert(replaceCalls.length === 1, "Navigates after replay success");
  
  console.log("✓ Test 2: Replay success passed\n");
  
  // ========================================================================
  // Test 3: Replay fails → warning, queue kept, no sign-out
  // ========================================================================
  console.log("=== Test 3: Replay fails → warning ===\n");
  
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
  const logSetFail = async () => ({ ok: false as const, error: "Network error" });
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="u3"
      signOut={signOutSuccess}
      logSet={logSetFail}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("u3")) === queueBefore, "u3 queue kept after replay fail");
  assert(replaceCalls.length === 0, "No navigation when replay fails");
  assert(screen.queryByText(/haven't synced yet/i) !== null, "Shows warning");
  
  console.log("✓ Test 3: Replay fails passed\n");
  
  console.log(`✅ H1 compatibility tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
