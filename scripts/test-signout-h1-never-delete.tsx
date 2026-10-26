#!/usr/bin/env tsx
/**
 * Test H1: Sign-out never deletes unsynced sets
 * 
 * Tests both SignOutButton and SignOutForm:
 * (a) Empty queue signs out
 * (b) Replay succeeds, queue empties, signs out
 * (c) Replay leaves N pending, warning shows, no signOut
 * (d) Sync now retries and signs out when empty
 * (e) Sign out anyway keeps queue byte-identical
 * (f) Per-user isolation
 */

import "./helpers/setup-jsdom";
import { mockNextRouter } from "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SignOutButton } from "../src/app/settings/signout-button";
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
  
  // Test both SignOutButton and SignOutForm
  const components = [
    { name: "SignOutButton" },
    { name: "SignOutForm" },
  ];
  
  for (const { name } of components) {
    console.log(`\n=== Testing ${name} ===\n`);
    
    // ========================================================================
    // Test (a): Empty queue signs out
    // ========================================================================
    console.log(`Test (a) ${name}: Empty queue signs out\n`);
    
    fakeStorage.clear();
    let signOutCalls = 0;
    
    const signOutSuccess = async () => {
      signOutCalls++;
      return { ok: true as const };
    };
    
    const logSetSuccess = async () => ({ ok: true as const });
    
    replaceCalls.length = 0;
    refreshCalls.length = 0;
    
    let unmountA: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u1" signOut={signOutSuccess} logSet={logSetSuccess} now={new Date(FIXED_TIME)} />);
      unmountA = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u1" signOut={signOutSuccess} logSet={logSetSuccess} now={new Date(FIXED_TIME)} />);
      unmountA = result.unmount;
    }
    
    await act(async () => {
      const button = screen.getByRole("button");
      button.click();
    });
    
    await act(async () => {});
    await act(async () => {});
    
    assert(signOutCalls === 1, `(a) ${name}: signOut called`);
    assert(replaceCalls.length === 1 && replaceCalls[0] === "/", `(a) ${name}: router.replace('/')`);
    
    unmountA();
    
    // ========================================================================
    // Test (b): Replay succeeds → signs out, queue empty
    // ========================================================================
    console.log(`\nTest (b) ${name}: Replay succeeds → queue empty, signs out\n`);
    
    fakeStorage.clear();
    savePendingSet(fakeStorage, "u2", "session-2", {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u2-1"
    }, fakeDeps);
    
    assert(fakeStorage.getItem(storageKey("u2")) !== null, `(b) ${name}: u2 queue exists before`);
    
    signOutCalls = 0;
    replaceCalls.length = 0;
    
    let unmountB: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u2" signOut={signOutSuccess} logSet={logSetSuccess} now={new Date(FIXED_TIME)} />);
      unmountB = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u2" signOut={signOutSuccess} logSet={logSetSuccess} now={new Date(FIXED_TIME)} />);
      unmountB = result.unmount;
    }
    
    await act(async () => {
      const buttons = screen.queryAllByRole("button");
      buttons[buttons.length - 1].click();
    });
    
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
    
    assert(signOutCalls === 1, `(b) ${name}: signOut called after replay`);
    assert(fakeStorage.getItem(storageKey("u2")) === null, `(b) ${name}: u2 queue empty`);
    
    unmountB();
    
    // ========================================================================
    // Test (c): Replay fails → warning shows N, no signOut
    // ========================================================================
    console.log(`\nTest (c) ${name}: Replay fails → warning, no signOut\n`);
    
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
    
    let unmountC: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u3" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountC = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u3" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountC = result.unmount;
    }
    
    await act(async () => {
      const buttons = screen.queryAllByRole("button");
      buttons[buttons.length - 1].click();
    });
    
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
    
    assert(signOutCalls === 0, `(c) ${name}: signOut NOT called`);
    
    const warningText = screen.queryByText(/2 sets haven't synced yet/i);
    assert(warningText !== null, `(c) ${name}: Shows '2 sets haven't synced yet'`);
    
    const syncButton = screen.queryByRole("button", { name: /Sync now/i });
    const signOutAnywayButton = screen.queryByRole("button", { name: /Sign out anyway/i });
    assert(syncButton !== null, `(c) ${name}: 'Sync now' button exists`);
    assert(signOutAnywayButton !== null, `(c) ${name}: 'Sign out anyway' button exists`);
    
    unmountC();
    
    // Test singular copy
    console.log(`\nTest (c2) ${name}: Singular copy for 1 set\n`);
    
    fakeStorage.clear();
    savePendingSet(fakeStorage, "u3b", "session-3b", {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-u3b-1"
    }, fakeDeps);
    
    let unmountC2: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u3b" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountC2 = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u3b" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountC2 = result.unmount;
    }
    
    await act(async () => {
      const buttons = screen.queryAllByRole("button");
      buttons[buttons.length - 1].click();
    });
    
    await act(async () => {});
    await act(async () => {});
    
    const singularText = screen.queryByText(/1 set hasn't synced yet/i);
    assert(singularText !== null, `(c2) ${name}: Shows '1 set hasn't synced yet'`);
    
    unmountC2();
    
    // ========================================================================
    // Test (d): "Sync now" succeeds → signs out
    // ========================================================================
    console.log(`\nTest (d) ${name}: 'Sync now' succeeds → signs out\n`);
    
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
    
    let unmountD: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u4" signOut={signOutSuccess} logSet={logSetFailOnceThenSucceed} now={new Date(FIXED_TIME)} />);
      unmountD = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u4" signOut={signOutSuccess} logSet={logSetFailOnceThenSucceed} now={new Date(FIXED_TIME)} />);
      unmountD = result.unmount;
    }
    
    await act(async () => {
      const buttons = screen.queryAllByRole("button");
      buttons[buttons.length - 1].click();
    });
    
    await act(async () => {});
    await act(async () => {});
    
    const syncNowButton = screen.getByRole("button", { name: /Sync now/i });
    
    await act(async () => {
      syncNowButton.click();
    });
    
    await act(async () => {});
    await act(async () => {});
    
    assert(signOutCalls === 1, `(d) ${name}: signOut called after 'Sync now'`);
    assert(fakeStorage.getItem(storageKey("u4")) === null, `(d) ${name}: u4 queue empty`);
    
    unmountD();
    
    // ========================================================================
    // Test (e): "Sign out anyway" → queue unchanged
    // ========================================================================
    console.log(`\nTest (e) ${name}: 'Sign out anyway' keeps queue\n`);
    
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
    assert(queueBeforeE !== null, `(e) ${name}: u5 queue exists before`);
    
    signOutCalls = 0;
    
    let unmountE: () => void;
    if (name === "SignOutButton") {
      const result = render(<SignOutButton userId="u5" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountE = result.unmount;
    } else {
      const result = render(<SignOutForm label="Sign out" userId="u5" signOut={signOutSuccess} logSet={logSetFail} now={new Date(FIXED_TIME)} />);
      unmountE = result.unmount;
    }
    
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
    
    assert(signOutCalls === 1, `(e) ${name}: signOut called`);
    
    const queueAfterE = fakeStorage.getItem(storageKey("u5"));
    assert(queueAfterE !== null, `(e) ${name}: u5 queue kept`);
    assert(queueAfterE === queueBeforeE, `(e) ${name}: u5 queue byte-identical`);
    
    unmountE();
  }
  
  // ========================================================================
  // Test (f): Per-user isolation
  // ========================================================================
  console.log(`\n=== Test (f): Per-user isolation ===\n`);
  
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
  console.log("MUTANTS TO TEST:");
  console.log("- Clear queue on 'Sign out anyway'");
  console.log("- Skip replay-first step");
  console.log("- Sign out despite pending");
  console.log("- Wrong N in warning\n");
  
  process.exit(0);
})();
