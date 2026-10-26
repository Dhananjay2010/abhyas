#!/usr/bin/env tsx
/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay uses injected clock in Discard handler.
 * Renders the REAL PendingSetReplay component and tests clock-dependent behavior.
 */

import "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { PendingSetReplay } from "../src/components/pending-set-replay";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = new Date('2026-01-15T12:00:00Z').getTime();

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

async function testDiscardWithExpiredSets() {
  console.log("\n📋 Test: Discard button uses injected clock for expired sets (>7 days)");
  
  fakeStorage.clear();
  const userId = "test-user";
  const sessionId = "test-session";
  
  // Plant a set that's 8 days old (expired)
  const eightDaysAgo = FIXED_TIME - 8 * 24 * 60 * 60 * 1000;
  const deps = createPendingSetDeps(() => eightDaysAgo);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "expired-set",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, deps);

  let logSetCalled = false;
  const mockLogSet = async () => {
    logSetCalled = true;
    return { ok: true } as const;
  };

  await act(async () => {
    render(
      <PendingSetReplay
        userId={userId}
        logSet={mockLogSet}
        now={new Date(FIXED_TIME)}
      />
    );
  });

  // Wait for replay to complete
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  // Should show the "couldn't be saved" message (expired sets are surfaced)
  const message = await screen.findByText(/couldn't be saved/i);
  assert(!!message, "Shows 'couldn't be saved' message for expired sets");

  // Should have a Discard button
  const discardButton = await screen.findByText(/discard/i);
  assert(!!discardButton, "Discard button exists");

  // logSet should NOT be called for expired sets
  assert(!logSetCalled, "logSet not called for expired sets (>7 days)");

  // Click Discard
  await act(async () => {
    discardButton.click();
  });

  // Wait for discard to complete
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  // Verify the set was cleared from storage
  // The clock-dependent behavior: if clock wasn't passed, the timestamp check might fail
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  const parsed = stored ? JSON.parse(stored) : {};
  assert(
    !parsed[sessionId] || parsed[sessionId].sets?.length === 0,
    "Sets cleared after Discard (mutant: not passing clock to createPendingSetDeps must fail this)"
  );

  fakeStorage.clear();
}

async function testDiscardWithEndedSession() {
  console.log("\n📋 Test: Discard button for ended session uses injected clock");
  
  fakeStorage.clear();
  const userId = "test-user-2";
  const sessionId = "ended-session";
  
  // Plant a set (recent, not expired)
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "ended-set",
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, fakeDeps);

  let logSetCalled = false;
  const mockLogSet = async () => {
    logSetCalled = true;
    return { ok: false, error: "Session closed" } as const;
  };

  const mockGetSessionStatus = async () => "ended" as const;

  await act(async () => {
    render(
      <PendingSetReplay
        userId={userId}
        getSessionStatus={mockGetSessionStatus}
        logSet={mockLogSet}
        now={new Date(FIXED_TIME)}
      />
    );
  });

  // Wait for replay to complete
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  // Should show the "workout ended" message
  const message = await screen.findByText(/workout ended/i);
  assert(!!message, "Shows 'workout ended' message for ended session");

  // Should have a Discard button
  const discardButton = await screen.findByText(/discard/i);
  assert(!!discardButton, "Discard button exists for ended session");

  // logSet should NOT be called for ended sessions
  assert(!logSetCalled, "logSet not called for ended session");

  // Click Discard
  await act(async () => {
    discardButton.click();
  });

  // Wait for discard to complete
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  // Verify the set was cleared
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  const parsed = stored ? JSON.parse(stored) : {};
  assert(
    !parsed[sessionId] || parsed[sessionId].sets?.length === 0,
    "Sets cleared after Discard for ended session (uses injected clock)"
  );

  fakeStorage.clear();
}

async function main() {
  console.log("Testing PendingSetReplay clock injection with jsdom...\n");
  
  try {
    await testDiscardWithExpiredSets();
    await testDiscardWithEndedSession();
    
    console.log(`\n✅ All PendingSetReplay clock injection tests passed (${passed} assertions)`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)`);
    console.error(error);
    process.exit(1);
  }
}

main();
