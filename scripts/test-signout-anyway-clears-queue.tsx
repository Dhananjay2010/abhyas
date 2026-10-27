#!/usr/bin/env tsx
/**
 * Test: Sign out anyway clears the queue (Item 1)
 * 
 * Verifies that "Sign out anyway" clears THAT user's pending-set queue
 * (only their key) before signing out, and that the confirm copy warns
 * that unsaved sets will be lost.
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";
import { render, act, screen, cleanup } from "@testing-library/react";
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

const FIXED_TIME = new Date('2026-10-27T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };

(async () => {
  console.log("\n📋 Test: Sign out anyway clears queue (Item 1)\n");
  
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(refreshCalls.length);
  };
  
  const signOutSuccess = async () => {
    return { ok: true as const };
  };
  
  const logSetFail = async () => ({ ok: false as const, error: "Network error" });
  
  // ========================================================================
  // Test 1: Sign out anyway removes only that user's key
  // ========================================================================
  console.log("=== Test 1: Sign out anyway removes only that user's key ===\n");
  
  fakeStorage.clear();
  
  // Set up pending sets for user1
  savePendingSet(fakeStorage, "user1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "user1-set1"
  }, fakeDeps);
  
  // Set up pending sets for user2
  savePendingSet(fakeStorage, "user2", "session2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 12,
    weightKg: 60,
    durationSeconds: null,
    clientId: "user2-set1"
  }, fakeDeps);
  
  assert(fakeStorage.getItem(storageKey("user1")) !== null, "user1 queue exists before");
  assert(fakeStorage.getItem(storageKey("user2")) !== null, "user2 queue exists before");
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="user1"
      signOut={signOutSuccess}
      logSet={logSetFail}
      now={new Date(FIXED_TIME)}
    />
  );
  
  // Click sign out to trigger warning
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(screen.queryByText(/hasn'?t synced yet/i) !== null, "Shows warning");
  
  // Click "Sign out anyway" to show confirm
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  
  // Check confirm copy
  const confirmCopy = screen.queryByText(/Sign out anyway\? Sets that haven't saved yet on this device will be lost/i);
  assert(confirmCopy !== null, "Shows confirm copy about sets being lost");
  
  // Click final "Sign out anyway" button in confirm dialog
  await act(async () => {
    const confirmButtons = screen.getAllByRole("button");
    const finalAnyway = confirmButtons.find(b => b.textContent === "Sign out anyway");
    if (!finalAnyway) throw new Error("Could not find final Sign out anyway button");
    finalAnyway.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(fakeStorage.getItem(storageKey("user1")) === null, "user1 queue cleared");
  assert(fakeStorage.getItem(storageKey("user2")) !== null, "user2 queue intact");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "Navigates after sign out anyway");
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Sync now still replays
  // ========================================================================
  console.log("=== Test 2: Sync now still replays ===\n");
  
  fakeStorage.clear();
  
  savePendingSet(fakeStorage, "user3", "session3", {
    sessionExerciseId: "ex3",
    setNumber: 1,
    reps: 15,
    weightKg: 70,
    durationSeconds: null,
    clientId: "user3-set1"
  }, fakeDeps);
  
  const logSetSuccess = async () => ({ ok: true as const });
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="user3"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
      now={new Date(FIXED_TIME)}
    />
  );
  
  // Click sign out - should trigger replay immediately
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // Replay succeeded, queue cleared, should navigate
  assert(fakeStorage.getItem(storageKey("user3")) === null, "user3 queue cleared after replay");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "Navigates after sync success");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  // ========================================================================
  // Test 3: Cancel button works in confirm dialog
  // ========================================================================
  console.log("=== Test 3: Cancel button works in confirm dialog ===\n");
  
  fakeStorage.clear();
  
  savePendingSet(fakeStorage, "user4", "session4", {
    sessionExerciseId: "ex4",
    setNumber: 1,
    reps: 8,
    weightKg: 40,
    durationSeconds: null,
    clientId: "user4-set1"
  }, fakeDeps);
  
  replaceCalls.length = 0;
  
  render(
    <SignOutForm
      label="Sign out"
      userId="user4"
      signOut={signOutSuccess}
      logSet={logSetFail}
      now={new Date(FIXED_TIME)}
    />
  );
  
  // Click sign out
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Click "Sign out anyway" to show confirm
  await act(async () => {
    const anywayButton = screen.getByText(/Sign out anyway/i);
    anywayButton.click();
  });
  
  await act(async () => {});
  
  // Click Cancel
  await act(async () => {
    const cancelButton = screen.getByText(/Cancel/i);
    cancelButton.click();
  });
  
  await act(async () => {});
  
  // Should be back at warning screen
  assert(screen.queryByText(/hasn'?t synced yet/i) !== null, "Back at warning screen");
  assert(fakeStorage.getItem(storageKey("user4")) !== null, "user4 queue still intact");
  assert(replaceCalls.length === 0, "No navigation occurred");
  
  cleanup();
  console.log("✓ Test 3 passed\n");
  
  console.log(`✅ Sign out anyway clears queue tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
