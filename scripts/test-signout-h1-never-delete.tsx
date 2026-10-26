#!/usr/bin/env tsx
/**
 * Test H1: Sign-out never deletes unsynced sets
 * 
 * Tests: (a) empty queue, (b) replay succeeds, (c) replay fails warning,
 * (d) Sync now succeeds, (e) Sign out anyway keeps queue, (f) per-user isolation
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";
import { savePendingSet, storageKey } from "../src/lib/session/pending-set-retry";
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

class FakeStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
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

const mockNextRouter = {
  replace: (path?: string) => {},
  refresh: () => {},
  push: (path: string) => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockNextRouter,
}));

(async () => {
  console.log("\n📋 Test H1: Sign-out never deletes unsynced sets\n");
  
  const replaceCalls: string[] = [];
  const refreshCalls: number[] = [];
  
  mockNextRouter.replace = (path?: string) => {
    if (path) replaceCalls.push(path);
  };
  mockNextRouter.refresh = () => {
    refreshCalls.push(refreshCalls.length);
  };
  
  // ========================================================================
  // Test (a): Empty queue signs out
  // ========================================================================
  console.log("=== Test (a): Empty queue signs out ===\n");
  
  fakeStorage.clear();
  let signOutCalls = 0;
  
  const signOutSuccess = async () => {
    signOutCalls++;
    return { ok: true as const };
  };
  
  const logSetSuccess = async () => ({ ok: true as const });
  
  replaceCalls.length = 0;
  refreshCalls.length = 0;
  
  render(
    <SignOutButton
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
  
  assert(signOutCalls === 1, "(a) signOut called");
  assert(replaceCalls.length === 1 && replaceCalls[0] === "/", "(a) router.replace('/')");
  
  // ========================================================================
  // Test (b): Pending, replay succeeds → signs out, queue empty
  // ========================================================================
  console.log("\n=== Test (b): Replay succeeds → signs out, queue empty ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u2", "session-2", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u2-1"
  }, fakeDeps);
  
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "(b) u2 queue exists before");
  
  signOutCalls = 0;
  replaceCalls.length = 0;
  
  const { unmount: unmount2 } = render(
    <SignOutButton
      userId="u2"
      signOut={signOutSuccess}
      logSet={logSetSuccess}
    />
  );
  
  await act(async () => {
    const buttons = screen.queryAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(signOutCalls === 1, "(b) signOut called after successful replay");
  assert(fakeStorage.getItem(storageKey("u2")) === null, "(b) u2 queue empty after replay");
  
  unmount2();
  
  // ========================================================================
  // Test (c): Replay fails → warning shows right N, no signOut
  // ========================================================================
  console.log("\n=== Test (c): Replay fails → warning, no signOut ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u3", "session-3", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u3-1"
  }, fakeDeps);
  savePendingSet(fakeStorage, "u3", "session-3", {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 12,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u3-2"
  }, fakeDeps);
  
  signOutCalls = 0;
  
  const logSetFail = async () => ({ ok: false as const, error: "Network error" });
  
  const { unmount: unmount3 } = render(
    <SignOutButton
      userId="u3"
      signOut={signOutSuccess}
      logSet={logSetFail}
    />
  );
  
  await act(async () => {
    const buttons = screen.queryAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  assert(signOutCalls === 0, "(c) signOut NOT called");
  
  const warningText = screen.queryByText(/2 sets haven't synced yet/i);
  assert(warningText !== null, "(c) Warning shows '2 sets haven't synced yet'");
  
  const syncButton = screen.queryByRole("button", { name: /Sync now/i });
  const signOutAnywayButton = screen.queryByRole("button", { name: /Sign out anyway/i });
  assert(syncButton !== null, "(c) 'Sync now' button exists");
  assert(signOutAnywayButton !== null, "(c) 'Sign out anyway' button exists");
  
  unmount3();
  
  // ========================================================================
  // Test (d): "Sync now" succeeds → signs out
  // ========================================================================
  console.log("\n=== Test (d): 'Sync now' succeeds → signs out ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u4", "session-4", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u4-1"
  }, fakeDeps);
  
  signOutCalls = 0;
  let logSetCallCount = 0;
  
  const logSetFailOnceThenSucceed = async () => {
    logSetCallCount++;
    if (logSetCallCount === 1) {
      return { ok: false as const, error: "Network error" };
    }
    return { ok: true as const };
  };
  
  const { unmount: unmount4 } = render(
    <SignOutButton
      userId="u4"
      signOut={signOutSuccess}
      logSet={logSetFailOnceThenSucceed}
    />
  );
  
  await act(async () => {
    const buttons = screen.queryAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Warning should show
  const syncNowButton = screen.getByRole("button", { name: /Sync now/i });
  
  await act(async () => {
    syncNowButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(signOutCalls === 1, "(d) signOut called after 'Sync now' succeeds");
  assert(fakeStorage.getItem(storageKey("u4")) === null, "(d) u4 queue empty");
  
  unmount4();
  
  // ========================================================================
  // Test (e): "Sign out anyway" → signOut called, queue unchanged
  // ========================================================================
  console.log("\n=== Test (e): 'Sign out anyway' keeps queue ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "u5", "session-5", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-u5-1"
  }, fakeDeps);
  
  const queueBeforeE = fakeStorage.getItem(storageKey("u5"));
  assert(queueBeforeE !== null, "(e) u5 queue exists before");
  
  signOutCalls = 0;
  
  const { unmount: unmount5 } = render(
    <SignOutButton
      userId="u5"
      signOut={signOutSuccess}
      logSet={logSetFail}
    />
  );
  
  await act(async () => {
    const buttons = screen.queryAllByRole("button");
    buttons[buttons.length - 1].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  const signOutAnywayBtn = screen.getByRole("button", { name: /Sign out anyway/i });
  
  await act(async () => {
    signOutAnywayBtn.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(signOutCalls === 1, "(e) signOut called");
  
  const queueAfterE = fakeStorage.getItem(storageKey("u5"));
  assert(queueAfterE !== null, "(e) u5 queue kept");
  assert(queueAfterE === queueBeforeE, "(e) u5 queue unchanged");
  
  unmount5();
  
  // ========================================================================
  // Test (f): User B doesn't see A's sets
  // ========================================================================
  console.log("\n=== Test (f): Per-user isolation ===\n");
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, "userA", "session-a", {
    sessionExerciseId: "ex-a",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-a"
  }, fakeDeps);
  
  const userBQueue = fakeStorage.getItem(storageKey("userB"));
  assert(userBQueue === null, "(f) User B sees no queue from User A");
  
  const userAQueue = fakeStorage.getItem(storageKey("userA"));
  assert(userAQueue !== null, "(f) User A's queue exists");
  
  console.log(`\n✅ H1 tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
