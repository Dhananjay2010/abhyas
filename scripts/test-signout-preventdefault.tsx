#!/usr/bin/env tsx
/**
 * test-signout-preventdefault.tsx
 * Verify that SignOutForm and SignOutButton call preventDefault on form submit.
 * Tests the REAL components with jsdom rendering.
 */

import "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { SignOutForm } from "../src/app/today/signout-form";
import { SignOutButton } from "../src/app/settings/signout-button";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();

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

Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

const fakeDeps: PendingSetDeps = {
  now: () => FIXED_TIME,
};

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

async function testSignOutFormWithPendingSets() {
  console.log("\n📋 Test: SignOutForm with pending sets shows warning");
  
  fakeStorage.clear();
  const userId = "test-user";
  const sessionId = "test-session";
  
  // Plant a pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "set-1",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, fakeDeps);

  let signOutCalled = false;
  let preventDefaultCalled = false;
  
  const mockSignOut = async () => {
    signOutCalled = true;
    return { ok: true } as const;
  };
  
  const mockLogSet = async () => {
    return { ok: true } as const;
  };

  await act(async () => {
    render(
      <SignOutForm
        label="Sign out"
        userId={userId}
        signOut={mockSignOut}
        logSet={mockLogSet}
        now={new Date(FIXED_TIME)}
      />
    );
  });

  // Should show warning
  const warningText = await screen.findByText(/set hasn't synced yet|sets haven't synced yet/i);
  assert(!!warningText, "Warning shown for pending sets");

  const syncButton = await screen.findByText(/sync now/i);
  assert(!!syncButton, "'Sync now' button exists");

  const signOutAnywayButton = await screen.findByText(/sign out anyway/i);
  assert(!!signOutAnywayButton, "'Sign out anyway' button exists");

  // Find the form and manually dispatch submit with preventDefault tracking
  const form = document.querySelector('form');
  assert(!!form, "Form element exists");

  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
  const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
  submitEvent.preventDefault = () => {
    preventDefaultCalled = true;
    originalPreventDefault();
  };

  form!.dispatchEvent(submitEvent);

  assert(preventDefaultCalled, "preventDefault called on submit (mutant: removing e.preventDefault() must fail this)");
  assert(!signOutCalled, "Sign out not called immediately when pending sets exist");

  fakeStorage.clear();
}

async function testSignOutFormWithoutPendingSets() {
  console.log("\n📋 Test: SignOutForm without pending sets signs out directly");
  
  fakeStorage.clear();
  const userId = "test-user-2";
  
  let signOutCalled = false;
  
  const mockSignOut = async () => {
    signOutCalled = true;
    return { ok: true } as const;
  };
  
  const mockLogSet = async () => {
    return { ok: true } as const;
  };

  await act(async () => {
    render(
      <SignOutForm
        label="Sign out"
        userId={userId}
        signOut={mockSignOut}
        logSet={mockLogSet}
        now={new Date(FIXED_TIME)}
      />
    );
  });

  // Should show direct sign-out button
  const signOutButton = await screen.findByText(/sign out/i);
  assert(!!signOutButton, "Sign out button exists");

  // No warning text
  const warningElements = screen.queryAllByText(/haven't synced yet/i);
  assert(warningElements.length === 0, "No warning shown without pending sets");

  fakeStorage.clear();
}

async function testSignOutButtonWithPendingSets() {
  console.log("\n📋 Test: SignOutButton with pending sets shows warning");
  
  fakeStorage.clear();
  const userId = "test-user-3";
  const sessionId = "test-session-3";
  
  // Plant a pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "set-2",
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, fakeDeps);

  let signOutCalled = false;
  let preventDefaultCalled = false;
  
  const mockSignOut = async () => {
    signOutCalled = true;
    return { ok: true } as const;
  };
  
  const mockLogSet = async () => {
    return { ok: true } as const;
  };

  await act(async () => {
    render(
      <SignOutButton
        userId={userId}
        signOut={mockSignOut}
        logSet={mockLogSet}
        now={new Date(FIXED_TIME)}
      />
    );
  });

  // Should show warning
  const warningText = await screen.findByText(/set hasn't synced yet|sets haven't synced yet/i);
  assert(!!warningText, "Warning shown for pending sets in SignOutButton");

  const syncButton = await screen.findByText(/sync now/i);
  assert(!!syncButton, "'Sync now' button exists in SignOutButton");

  // Find the form and dispatch submit with preventDefault tracking
  const form = document.querySelector('form');
  assert(!!form, "Form element exists in SignOutButton");

  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
  const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
  submitEvent.preventDefault = () => {
    preventDefaultCalled = true;
    originalPreventDefault();
  };

  form!.dispatchEvent(submitEvent);

  assert(preventDefaultCalled, "preventDefault called on SignOutButton submit (mutant: removing e.preventDefault() must fail this)");
  assert(!signOutCalled, "Sign out not called immediately when pending sets exist in SignOutButton");

  fakeStorage.clear();
}

async function main() {
  console.log("Testing sign-out components with jsdom...\n");
  
  try {
    await testSignOutFormWithPendingSets();
    await testSignOutFormWithoutPendingSets();
    await testSignOutButtonWithPendingSets();
    
    console.log(`\n✅ All sign-out component tests passed (${passed} assertions)`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)`);
    console.error(error);
    process.exit(1);
  }
}

main();
