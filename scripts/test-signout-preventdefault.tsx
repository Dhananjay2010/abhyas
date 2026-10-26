#!/usr/bin/env tsx
/**
 * test-signout-preventdefault.tsx
 * Test SignOutFormView with jsdom rendering.
 */

import "./helpers/setup-jsdom";

import { render, act, screen, cleanup } from "@testing-library/react";
import { SignOutFormView } from "../src/app/today/signout-form";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

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

const fakeDeps = createPendingSetDeps(() => FIXED_TIME);

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

async function testWithPendingSets() {
  console.log("\n📋 Test: SignOutFormView with pending sets");
  
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
  let syncCalled = false;
  let signOutAnywayCalled = false;

  await act(async () => {
    render(
      <SignOutFormView
        label="Sign out"
        pending={false}
        error={null}
        pendingCount={1}
        showWarning={true}
        handleSignOut={() => { signOutCalled = true; }}
        handleSyncNow={() => { syncCalled = true; }}
        handleSignOutAnyway={() => { signOutAnywayCalled = true; }}
      />
    );
  });

  // Should show warning
  const warningText = screen.getByText(/1 set hasn't synced yet/i);
  assert(!!warningText, "Shows 'N sets haven't synced yet' warning");

  const syncButton = screen.getByText(/sync now/i);
  assert(!!syncButton, "'Sync now' button exists");

  const signOutAnywayButton = screen.getByText(/sign out anyway/i);
  assert(!!signOutAnywayButton, "'Sign out anyway' button exists");

  // Click Sync now
  await act(async () => {
    syncButton.click();
  });

  assert(syncCalled, "Sync now handler called");
  assert(!signOutCalled, "Sign out not called when Sync clicked");

  cleanup();
  fakeStorage.clear();
}

async function testWithoutPendingSets() {
  console.log("\n📋 Test: SignOutFormView without pending sets");
  
  cleanup(); // Clean up any previous renders
  fakeStorage.clear();

  let signOutCalled = false;
  let preventDefaultCalled = false;

  await act(async () => {
    render(
      <SignOutFormView
        label="Sign out"
        pending={false}
        error={null}
        pendingCount={0}
        showWarning={false}
        handleSignOut={() => { signOutCalled = true; }}
        handleSyncNow={() => {}}
        handleSignOutAnyway={() => {}}
      />
    );
  });

  // Should show sign-out button  
  const signOutButton = screen.getByRole('button', { name: /sign out/i });
  assert(!!signOutButton, "Sign out button exists");

  // No warning text
  const warningElements = screen.queryAllByText(/haven't synced yet/i);
  assert(warningElements.length === 0, "No warning shown without pending sets");

  // Find the form
  const form = document.querySelector('form');
  assert(!!form, "Form element exists (no-JS fallback)");
  
  if (!form) throw new Error("Form not found");
  
  assert(form.action.endsWith('/auth/signout'), "Form action is /auth/signout");
  assert(form.method === 'post', "Form method is post");

  // Dispatch submit event with preventDefault tracking
  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
  const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
  submitEvent.preventDefault = () => {
    preventDefaultCalled = true;
    originalPreventDefault();
  };

  form.dispatchEvent(submitEvent);

  assert(preventDefaultCalled, "preventDefault called (mutant: removing e.preventDefault() must fail this)");
  assert(signOutCalled, "Sign out handler called");

  cleanup();
  fakeStorage.clear();
}

async function testSignOutAnywayKeepsPending() {
  console.log("\n📋 Test: Sign out anyway keeps pending sets");
  
  cleanup(); // Clean up any previous renders
  fakeStorage.clear();
  const userId = "test-user-2";
  const sessionId = "test-session-2";
  
  // Plant a pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "set-2",
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, fakeDeps);

  let signOutAnywayCalled = false;

  await act(async () => {
    render(
      <SignOutFormView
        label="Sign out"
        pending={false}
        error={null}
        pendingCount={1}
        showWarning={true}
        handleSignOut={() => {}}
        handleSyncNow={() => {}}
        handleSignOutAnyway={() => { signOutAnywayCalled = true; }}
      />
    );
  });

  const signOutAnywayButton = screen.getByText(/sign out anyway/i);
  
  // Click Sign out anyway
  await act(async () => {
    signOutAnywayButton.click();
  });

  assert(signOutAnywayCalled, "Sign out anyway handler called");

  // Verify pending set is still in storage (not cleared by the view)
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  assert(!!stored, "Pending sets kept in storage (cleared by useSignOut, not the view)");

  fakeStorage.clear();
}

async function main() {
  console.log("Testing SignOutFormView with jsdom...\n");
  
  try {
    await testWithPendingSets();
    await testWithoutPendingSets();
    await testSignOutAnywayKeepsPending();
    
    console.log(`\n✅ All SignOutFormView tests passed (${passed} assertions)`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)`);
    console.error(error);
    process.exit(1);
  }
}

main();
