#!/usr/bin/env tsx
/**
 * test-discard-clock-injection.tsx
 * Test PendingSetReplay with jsdom rendering and clock injection.
 */

import "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { PendingSetReplay } from "../src/components/pending-set-replay";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

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

async function testExpiredSetsAreSurfaced() {
  console.log("\n📋 Test: Expired sets (>7 days) are surfaced with Discard");
  
  fakeStorage.clear();
  const userId = "user-expired";
  const sessionId = "session-expired";
  
  // Plant a set that's 8 days old
  const eightDaysAgo = FIXED_TIME - 8 * 24 * 60 * 60 * 1000;
  const oldDeps = createPendingSetDeps(() => eightDaysAgo);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "expired-set",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, oldDeps);

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
        storage={fakeStorage}
      />
    );
  });

  // Wait for replay to complete
  await act(async () => {
    await Promise.resolve();
  });

  // Should show "couldn't be saved" message
  const message = await screen.findByText(/couldn't be saved/i);
  assert(!!message, "Shows 'couldn't be saved' message for expired sets");

  // Should have Discard button
  const discardButton = await screen.findByText(/discard/i);
  assert(!!discardButton, "Discard button exists");

  // logSet should NOT be called for expired sets
  assert(!logSetCalled, "logSet not called for expired sets (>7 days)");

  // Click Discard
  await act(async () => {
    discardButton.click();
  });

  // Wait for state update
  await act(async () => {
    await Promise.resolve();
  });

  // Verify sets cleared using injected clock
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  const parsed = stored ? JSON.parse(stored) : {};
  assert(
    !parsed[sessionId] || parsed[sessionId].sets?.length === 0,
    "Sets cleared after Discard (mutant: not passing clock/now to createPendingSetDeps must fail this)"
  );

  fakeStorage.clear();
}

async function testEndedSessionIsSurfaced() {
  console.log("\n📋 Test: Ended session is surfaced via getSessionStatus");
  
  fakeStorage.clear();
  const userId = "user-ended";
  const sessionId = "session-ended";
  
  // Plant a recent set
  const deps = createPendingSetDeps(() => FIXED_TIME);
  savePendingSet(fakeStorage, userId, sessionId, {
    clientId: "ended-set",
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }, deps);

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
        storage={fakeStorage}
      />
    );
  });

  // Wait for replay to complete
  await act(async () => {
    await Promise.resolve();
  });

  // Should show "workout ended" message
  const message = await screen.findByText(/workout ended/i);
  assert(!!message, "Shows 'workout ended' message for ended session (via getSessionStatus)");

  // logSet should NOT be called for ended sessions
  assert(!logSetCalled, "logSet not called for ended session (mutant: missing getSessionStatus must fail this)");

  // Click Discard
  const discardButton = await screen.findByText(/discard/i);
  await act(async () => {
    discardButton.click();
  });

  // Wait for clear
  await act(async () => {
    await Promise.resolve();
  });

  // Verify cleared
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  const parsed = stored ? JSON.parse(stored) : {};
  assert(
    !parsed[sessionId] || parsed[sessionId].sets?.length === 0,
    "Sets cleared after Discard for ended session"
  );

  fakeStorage.clear();
}

async function main() {
  console.log("Testing PendingSetReplay with jsdom...\n");
  
  try {
    await testExpiredSetsAreSurfaced();
    await testEndedSessionIsSurfaced();
    
    console.log(`\n✅ All PendingSetReplay tests passed (${passed} assertions)`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)`);
    console.error(error);
    process.exit(1);
  }
}

main();
