#!/usr/bin/env tsx
/**
 * Test: SignOutButton clears pending sets and navigates correctly
 * 
 * Covers:
 * - Success: clearSets called after signOut returns {ok:true}, then navigation
 * - Failure: queue NOT cleared when signOut returns {ok:false}
 * - Throw: queue NOT cleared when signOut throws
 * - Navigation: router.replace("/") and router.refresh() both called
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";
import { savePendingSet, clearAllPendingSetsForUser } from "../src/lib/session/pending-set-retry";
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
  console.log("\n📋 Test: SignOutButton clears and navigates\n");
  
  const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();
  const fakeDeps: PendingSetDeps = {
    now: () => FIXED_TIME,
  };
  
  // Track router calls
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(refreshCalls.length);
  };
  
  // ========================================================================
  // Test 1: Success path - clear after signOut, then navigate
  // ========================================================================
  console.log("=== Test 1: Success path ===\n");
  
  const callOrder: string[] = [];
  
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
  
  assert(fakeStorage.getItem("pending-sets:u1") !== null, "u1 pending sets exist before");
  assert(fakeStorage.getItem("pending-sets:u2") !== null, "u2 pending sets exist before");
  
  const clearSets = (storage: Storage, userId: string) => {
    callOrder.push("clearSets");
    assert(userId === "u1", "clearSets called with correct userId u1");
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutSuccess = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    callOrder.push("signOut");
    return { ok: true };
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
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
  
  assert(callOrder[0] === "signOut", "signOut called first");
  assert(callOrder[1] === "clearSets", "clearSets called after signOut success");
  assert(fakeStorage.getItem("pending-sets:u1") === null, "u1 pending sets removed");
  assert(fakeStorage.getItem("pending-sets:u2") !== null, "u2 pending sets kept");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "M13: router.replace('/') called once");
  assert(refreshCalls.length === 1, "M13: router.refresh() called once");
  
  // ========================================================================
  // Test 2: Failure path - queue NOT cleared
  // ========================================================================
  console.log("\n=== Test 2: Failure path (returns error) ===\n");
  
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
  
  const clearSetsFailure = (storage: Storage, userId: string) => {
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutFailure = async () => {
    return { ok: false as const, error: "Sign-out failed" };
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutButton
      userId="u3"
      clearSets={clearSetsFailure}
      signOut={signOutFailure}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  const remainingQueue = fakeStorage.getItem("pending-sets:u3");
  assert(remainingQueue !== null, "Queue stays when sign-out fails");
  assert(remainingQueue === queueData, "Queue unchanged on failure");
  assert(replaceCalls.length === 0, "router.replace not called on failure");
  assert(refreshCalls.length === 0, "router.refresh not called on failure");
  
  // ========================================================================
  // Test 3: Throw path - queue NOT cleared (M9)
  // ========================================================================
  console.log("\n=== Test 3: Throw path (M9) ===\n");
  
  fakeStorage.clear();
  const queueDataThrow = JSON.stringify({
    version: 1,
    timestamp: FIXED_TIME,
    sets: [{
      sessionExerciseId: "ex4",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u4"
    }]
  });
  fakeStorage.setItem("pending-sets:u4", queueDataThrow);
  
  const clearSetsThrow = (storage: Storage, userId: string) => {
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutThrow = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    throw new Error("Network error");
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutButton
      userId="u4"
      clearSets={clearSetsThrow}
      signOut={signOutThrow}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  const remainingQueueThrow = fakeStorage.getItem("pending-sets:u4");
  assert(remainingQueueThrow !== null, "M9: Queue stays when sign-out throws");
  assert(remainingQueueThrow === queueDataThrow, "M9: Queue unchanged when thrown");
  assert(replaceCalls.length === 0, "M9: router.replace not called when thrown");
  assert(refreshCalls.length === 0, "M9: router.refresh not called when thrown");
  
  // ========================================================================
  // Test 4: Expired session - still signs out locally, keeps queue, navigates
  // ========================================================================
  console.log("\n=== Test 4: Expired session path (B6) ===\n");
  
  fakeStorage.clear();
  const queueDataExpired = JSON.stringify({
    version: 1,
    timestamp: FIXED_TIME,
    sets: [{
      sessionExerciseId: "ex5",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u5"
    }]
  });
  fakeStorage.setItem("pending-sets:u5", queueDataExpired);
  
  // Mock fetch for /auth/signout
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlString.includes("/auth/signout") && init?.method === "POST") {
      fetchCalled = true;
      return new Response("", { status: 200 });
    }
    return originalFetch(url, init);
  };
  
  const clearSetsExpired = (storage: Storage, userId: string) => {
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutExpired = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    // Simulate expired session - throw error with SESSION_EXPIRED prefix
    throw new Error("SESSION_EXPIRED: Session has expired");
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutButton
      userId="u5"
      clearSets={clearSetsExpired}
      signOut={signOutExpired}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Restore original fetch
  global.fetch = originalFetch;
  
  const remainingQueueExpired = fakeStorage.getItem("pending-sets:u5");
  assert(remainingQueueExpired !== null, "B6: Queue kept when session expired");
  assert(remainingQueueExpired === queueDataExpired, "B6: Queue unchanged when expired");
  assert(fetchCalled, "B6: POST /auth/signout called for local sign-out");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "B6: router.replace called when expired");
  assert(refreshCalls.length === 1, "B6: router.refresh called when expired");
  
  // ========================================================================
  // Test 5: Expired session with non-ok fetch response - shows error, doesn't navigate
  // ========================================================================
  console.log("\n=== Test 5: Expired session with non-ok fetch response ===\n");
  
  fakeStorage.clear();
  const queueDataExpiredFail = JSON.stringify({
    version: 1,
    timestamp: FIXED_TIME,
    sets: [{
      sessionExerciseId: "ex6",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u6"
    }]
  });
  fakeStorage.setItem("pending-sets:u6", queueDataExpiredFail);
  
  // Mock fetch to return 500 error
  let fetchCalledFail = false;
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlString.includes("/auth/signout") && init?.method === "POST") {
      fetchCalledFail = true;
      return new Response("Server error", { status: 500 });
    }
    return originalFetch(url, init);
  };
  
  const clearSetsExpiredFail = (storage: Storage, userId: string) => {
    clearAllPendingSetsForUser(storage, userId);
  };
  
  const signOutExpiredFail = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    throw new Error("SESSION_EXPIRED: Session has expired");
  };
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutButton
      userId="u6"
      clearSets={clearSetsExpiredFail}
      signOut={signOutExpiredFail}
    />
  );
  
  await act(async () => {
    const buttons = screen.getAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Restore original fetch
  global.fetch = originalFetch;
  
  const remainingQueueExpiredFail = fakeStorage.getItem("pending-sets:u6");
  assert(remainingQueueExpiredFail !== null, "Queue kept when fetch fails");
  assert(fetchCalledFail, "POST /auth/signout called");
  assert(replaceCalls.length === 0, "router.replace NOT called when fetch fails");
  assert(refreshCalls.length === 0, "router.refresh NOT called when fetch fails");
  
  // Check that error message is shown
  const errorMsg = screen.queryByText(/Failed to sign out/i);
  assert(errorMsg !== null, "Error message shown when fetch fails");
  
  console.log("\nPLANTED BUG: Clearing queue before checking sign-out result → data loss");
  console.log("MUTANT M9: Clear on throw → kills the queue even when signOut throws");
  console.log("MUTANT B6-clear: Clear queue on expired path → loses replay data");
  console.log("MUTANT B6-skip: Skip local sign-out on expired path → cookies not cleared\n");
  
  console.log(`\n✅ SignOutButton test passed (${passed} assertions)\n`);
  process.exit(0);
})();
