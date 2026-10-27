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
  console.log("\n📋 Test: Discard clears old-format data with injected clock (M3a)");
  
  fakeStorage.clear();
  const userId = "user-m3a";
  const sessionId = "session-m3a";
  
  // Plant OLD-FORMAT data (without timestamp)
  // This tests M3a: handleDiscard must pass clock to createPendingSetDeps
  const oldFormatData = {
    [sessionId]: [{
      clientId: "old-format-set",
      sessionExerciseId: "ex-1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }]
  };
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify(oldFormatData));
  
  const mockLogSet = async () => {
    return { ok: true } as const;
  };

  // Mock getSessionStatus to return "ended" so the component surfaces it for discard
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

  // Should surface the ended session
  const discardButton = await screen.findByText(/discard/i);
  assert(!!discardButton, "Discard button exists for ended session");

  // Click Discard - this triggers handleDiscard which must pass clock
  await act(async () => {
    discardButton.click();
  });

  // Wait for state update
  await act(async () => {
    await Promise.resolve();
  });

  // Verify sets cleared - with clock injection, the old-format data is properly migrated and cleared
  // Mutant M3a: without clock, the migration would use real Date.now() instead of FIXED_TIME
  const stored = fakeStorage.getItem(`pending-sets:${userId}`);
  assert(
    stored === null || stored === "{}",
    "Old-format data cleared after Discard (M3a: not passing clock would fail to clear properly)"
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
