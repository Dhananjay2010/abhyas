#!/usr/bin/env tsx
/**
 * Test: 7-day expiry policy - keep and surface instead of dropping
 * 
 * Tests that expired sets (> 7 days) are kept and surfaced with Discard button.
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup } from "@testing-library/react";
import { PendingSetReplay } from "../src/components/pending-set-replay";
import { storageKey } from "../src/lib/session/pending-set-retry";
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
  console.log("\n📋 Test: 7-day expiry policy (Issue #6)\n");
  
  // Current time
  const NOW = new Date('2026-11-05T12:00:00Z').getTime();
  
  // Time 8 days ago (expired)
  const EIGHT_DAYS_AGO = NOW - (8 * 24 * 60 * 60 * 1000);
  
  // ========================================================================
  // Test 1: Expired sets (> 7 days) are kept and surfaced
  // ========================================================================
  console.log("=== Test 1: Expired sets kept and surfaced ===\n");
  
  fakeStorage.clear();
  
  // Manually create expired pending sets (saved 8 days ago)
  const expiredData = {
    "session1": {
      sets: [
        {
          sessionExerciseId: "ex1",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "set1"
        }
      ],
      timestamp: EIGHT_DAYS_AGO
    }
  };
  
  fakeStorage.setItem(storageKey("u1"), JSON.stringify(expiredData));
  
  const queueBefore = fakeStorage.getItem(storageKey("u1"));
  assert(queueBefore !== null, "Expired sets exist before replay");
  
  let logSetCalls = 0;
  const logSetSuccess = async () => {
    logSetCalls++;
    return { ok: true as const };
  };
  
  // Don't need getSessionStatus - expired sets are automatically treated as closed
  render(
    <PendingSetReplay
      userId="u1"
      logSet={logSetSuccess}
      now={new Date(NOW)}
    />
  );
  
  await act(async () => {
    await Promise.resolve();
  });
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(logSetCalls === 0, "No replay attempted for expired sets");
  assert(fakeStorage.getItem(storageKey("u1")) !== null, "Expired sets kept (not deleted)");
  
  // Check that warning is shown
  const warning = screen.queryByText(/couldn'?t be saved because.*workout ended/i);
  assert(warning !== null, "Warning message shown for expired sets");
  
  const discardButton = screen.queryByText(/Discard/i);
  assert(discardButton !== null, "Discard button shown for expired sets");
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Discard removes expired sets
  // ========================================================================
  console.log("=== Test 2: Discard removes expired sets ===\n");
  
  fakeStorage.clear();
  fakeStorage.setItem(storageKey("u2"), JSON.stringify(expiredData));
  
  render(
    <PendingSetReplay
      userId="u2"
      logSet={logSetSuccess}
      now={new Date(NOW)}
    />
  );
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(fakeStorage.getItem(storageKey("u2")) !== null, "Sets exist before discard");
  
  // Click Discard
  await act(async () => {
    const discardBtn = screen.getByText(/Discard/i);
    discardBtn.click();
  });
  
  await act(async () => {
    await Promise.resolve();
  });
  
  assert(fakeStorage.getItem(storageKey("u2")) === null, "Expired sets removed after discard");
  
  const warningAfter = screen.queryByText(/couldn'?t be saved/i);
  assert(warningAfter === null, "Warning removed after discard");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`✅ 7-day expiry tests passed (${passed} assertions)\n`);
  
  console.log("MUTANTS TO TEST:");
  console.log("- Delete expired sets instead of keeping them (must fail)");
  console.log("- Skip surfacing expired sets (must fail)\n");
  
  process.exit(0);
})();
