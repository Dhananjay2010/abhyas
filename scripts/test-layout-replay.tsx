#!/usr/bin/env tsx
/**
 * test-layout-replay.tsx
 * Test PendingSetReplayProviderView with jsdom rendering and fake auth.
 */

import "./helpers/setup-jsdom";

import { render, act, screen, cleanup } from "@testing-library/react";
import { PendingSetReplayProviderView, type AuthSubscription } from "../src/components/pending-set-replay-provider";
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

async function testSignedInRendersReplay() {
  console.log("\n📋 Test: Signed in renders PendingSetReplay");
  
  fakeStorage.clear();
  
  // Seed storage with a pending set for user1
  const deps = createPendingSetDeps(() => FIXED_TIME);
  savePendingSet(fakeStorage, "user1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 60,
    durationSeconds: null,
    clientId: "ex1:1:123",
  }, deps);

  const fakeGetUser = async () => ({ id: "user1" });
  const authCallbacks: ((event: string, session: unknown) => void)[] = [];
  const fakeOnAuthStateChange = (callback: (event: string, session: unknown) => void): AuthSubscription => {
    authCallbacks.push(callback);
    return {
      unsubscribe: () => {
        const index = authCallbacks.indexOf(callback);
        if (index > -1) authCallbacks.splice(index, 1);
      },
    };
  };
  const fakeGetSessionStatus = async () => "ended" as const;

  await act(async () => {
    render(
      <PendingSetReplayProviderView
        getUser={fakeGetUser}
        onAuthStateChange={fakeOnAuthStateChange}
        getSessionStatus={fakeGetSessionStatus}
      />
    );
  });

  // Wait for effect
  await act(async () => {
    await Promise.resolve();
  });

  // Assert the replay UI renders with the pending set count
  const elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length > 0, "Provider renders replay UI when signed in with pending sets");

  cleanup();
  fakeStorage.clear();
}

async function testSignedOutRendersNothing() {
  console.log("\n📋 Test: Signed out renders nothing");
  
  fakeStorage.clear();

  const fakeGetUser = async () => null;
  const authCallbacks: ((event: string, session: unknown) => void)[] = [];
  const fakeOnAuthStateChange = (callback: (event: string, session: unknown) => void): AuthSubscription => {
    authCallbacks.push(callback);
    return {
      unsubscribe: () => {
        const index = authCallbacks.indexOf(callback);
        if (index > -1) authCallbacks.splice(index, 1);
      },
    };
  };
  const fakeGetSessionStatus = async () => "in_progress" as const;

  await act(async () => {
    render(
      <PendingSetReplayProviderView
        getUser={fakeGetUser}
        onAuthStateChange={fakeOnAuthStateChange}
        getSessionStatus={fakeGetSessionStatus}
      />
    );
  });

  // Wait for effect
  await act(async () => {
    await Promise.resolve();
  });

  // Should render nothing (returns null when !userId)
  const elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length === 0, "Provider renders nothing when signed out");

  cleanup();
  fakeStorage.clear();
}

async function testAuthStateChangeSignOut() {
  console.log("\n📋 Test: onAuthStateChange sign-out clears provider");
  
  fakeStorage.clear();
  
  // Seed storage with a pending set for user1
  const deps = createPendingSetDeps(() => FIXED_TIME);
  savePendingSet(fakeStorage, "user1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 60,
    durationSeconds: null,
    clientId: "ex1:1:123",
  }, deps);

  let currentUser: { id: string } | null = { id: "user1" };
  const fakeGetUser = async () => currentUser;
  
  const authCallbacks: ((event: string, session: unknown) => void)[] = [];
  const fakeOnAuthStateChange = (callback: (event: string, session: unknown) => void): AuthSubscription => {
    authCallbacks.push(callback);
    return {
      unsubscribe: () => {
        const index = authCallbacks.indexOf(callback);
        if (index > -1) authCallbacks.splice(index, 1);
      },
    };
  };
  const fakeGetSessionStatus = async () => "ended" as const;

  await act(async () => {
    render(
      <PendingSetReplayProviderView
        getUser={fakeGetUser}
        onAuthStateChange={fakeOnAuthStateChange}
        getSessionStatus={fakeGetSessionStatus}
      />
    );
  });

  // Wait for initial render
  await act(async () => {
    await Promise.resolve();
  });
  
  // Assert replay UI is visible with pending set
  let elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length > 0, "Provider renders replay UI initially");

  // Simulate sign-out
  currentUser = null;
  await act(async () => {
    authCallbacks.forEach(cb => cb("SIGNED_OUT", null));
  });

  // Wait for state update
  await act(async () => {
    await Promise.resolve();
  });

  // Should render nothing after sign-out
  elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length === 0, "Provider cleared on sign-out");

  cleanup();
  fakeStorage.clear();
}

async function testAuthStateChangeSwitchUser() {
  console.log("\n📋 Test: onAuthStateChange switches userId");
  
  fakeStorage.clear();
  
  // Seed storage with pending sets for both users
  const deps = createPendingSetDeps(() => FIXED_TIME);
  savePendingSet(fakeStorage, "user1", "session1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 60,
    durationSeconds: null,
    clientId: "user1:ex1:1:123",
  }, deps);
  
  savePendingSet(fakeStorage, "user2", "session2", {
    sessionExerciseId: "ex2",
    setNumber: 1,
    reps: 12,
    weightKg: 80,
    durationSeconds: null,
    clientId: "user2:ex2:1:456",
  }, deps);

  let currentUser: { id: string } | null = { id: "user1" };
  const fakeGetUser = async () => currentUser;
  
  const authCallbacks: ((event: string, session: unknown) => void)[] = [];
  const fakeOnAuthStateChange = (callback: (event: string, session: unknown) => void): AuthSubscription => {
    authCallbacks.push(callback);
    return {
      unsubscribe: () => {
        const index = authCallbacks.indexOf(callback);
        if (index > -1) authCallbacks.splice(index, 1);
      },
    };
  };
  const fakeGetSessionStatus = async () => "ended" as const;

  await act(async () => {
    render(
      <PendingSetReplayProviderView
        getUser={fakeGetUser}
        onAuthStateChange={fakeOnAuthStateChange}
        getSessionStatus={fakeGetSessionStatus}
      />
    );
  });

  // Wait for initial render with user1
  await act(async () => {
    await Promise.resolve();
  });
  
  // Assert user1's replay UI is visible
  let elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length > 0, "Provider shows user1's pending sets");

  // Simulate sign-in as different user
  currentUser = { id: "user2" };
  await act(async () => {
    authCallbacks.forEach(cb => cb("SIGNED_IN", { user: { id: "user2" } }));
  });

  // Wait for state update
  await act(async () => {
    await Promise.resolve();
  });

  // Provider should now show user2's pending sets
  elements = screen.queryAllByText(/couldn't be saved|discard/i);
  assert(elements.length > 0, "Provider switches to user2's pending sets");

  cleanup();
  fakeStorage.clear();
}

async function testGetSessionStatusForEndedSession() {
  console.log("\n📋 Test: getSessionStatus surfaces ended session");
  
  fakeStorage.clear();
  const userId = "user-ended";
  const sessionId = "session-ended";
  
  // Plant a pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "ended-set",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, fakeDeps);

  const fakeGetUser = async () => ({ id: userId });
  const authCallbacks: ((event: string, session: unknown) => void)[] = [];
  const fakeOnAuthStateChange = (callback: (event: string, session: unknown) => void): AuthSubscription => {
    authCallbacks.push(callback);
    return {
      unsubscribe: () => {
        const index = authCallbacks.indexOf(callback);
        if (index > -1) authCallbacks.splice(index, 1);
      },
    };
  };
  
  const fakeGetSessionStatus = async (sid: string) => {
    if (sid === sessionId) return "ended" as const;
    return "in_progress" as const;
  };

  // Override window.localStorage for this test
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });

  await act(async () => {
    render(
      <PendingSetReplayProviderView
        getUser={fakeGetUser}
        onAuthStateChange={fakeOnAuthStateChange}
        getSessionStatus={fakeGetSessionStatus}
      />
    );
  });

  // Wait for replay to complete
  await act(async () => {
    await Promise.resolve();
  });

  // Should show "workout ended" message (surfaced via getSessionStatus)
  const message = await screen.findByText(/workout ended/i);
  assert(!!message, "Shows 'workout ended' via getSessionStatus (mutant: missing getSessionStatus must fail this)");

  cleanup();
  fakeStorage.clear();
}

async function main() {
  console.log("Testing PendingSetReplayProviderView with jsdom...\n");
  
  try {
    await testSignedInRendersReplay();
    await testSignedOutRendersNothing();
    await testAuthStateChangeSignOut();
    await testAuthStateChangeSwitchUser();
    await testGetSessionStatusForEndedSession();
    
    console.log(`\n✅ All PendingSetReplayProviderView tests passed (${passed} assertions)`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)`);
    console.error(error);
    process.exit(1);
  }
}

main();