#!/usr/bin/env tsx
/**
 * Test: Shared pending set outcome handler
 * 
 * Tests attemptPendingSet with all outcomes: ok, set_exists, duplicate (23505), closed session, network, expired.
 */

import type { PendingSet, PendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Storage } from "../src/lib/session/pending-set-retry";
import { attemptPendingSet } from "../src/lib/session/pending-set-outcome";
import { savePendingSet, storageKey } from "../src/lib/session/pending-set-retry";

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

(async () => {
  console.log("\n📋 Test: Shared pending set outcome handler\n");
  
  const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
  const deps: PendingSetDeps = { now: () => FIXED_TIME };
  const storage = new FakeStorage();
  
  const set: PendingSet = {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client1"
  };
  
  // ========================================================================
  // Test 1: Outcome "ok" - success clears the set
  // ========================================================================
  console.log("=== Test 1: Outcome OK (success) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u1", "s1", set, deps);
  assert(storage.getItem(storageKey("u1")) !== null, "Set saved before");
  
  const logSetOk = async () => ({ ok: true as const });
  
  const outcome1 = await attemptPendingSet({
    set,
    userId: "u1",
    sessionId: "s1",
    storage,
    deps,
    logSet: logSetOk,
    sessionStatus: "in-progress"
  });
  
  assert(outcome1.status === "saved", "Outcome is saved");
  assert(storage.getItem(storageKey("u1")) === null, "Set cleared after success");
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Outcome "set_exists" (via reason) - clears the set
  // ========================================================================
  console.log("=== Test 2: Outcome set_exists (via reason) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u2", "s2", set, deps);
  
  const logSetExists = async () => ({ ok: false as const, reason: "set_exists" as const });
  
  const outcome2 = await attemptPendingSet({
    set,
    userId: "u2",
    sessionId: "s2",
    storage,
    deps,
    logSet: logSetExists,
    sessionStatus: "in-progress"
  });
  
  assert(outcome2.status === "saved", "Outcome is saved (duplicate)");
  assert(storage.getItem(storageKey("u2")) === null, "Set cleared after duplicate");
  console.log("✓ Test 2 passed\n");
  
  // ========================================================================
  // Test 3: Outcome "duplicate" (via code 23505) - clears the set
  // ========================================================================
  console.log("=== Test 3: Outcome duplicate (code 23505) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u3", "s3", set, deps);
  
  const logSetDuplicate = async () => ({ ok: false as const, error: "Duplicate", code: "23505" });
  
  const outcome3 = await attemptPendingSet({
    set,
    userId: "u3",
    sessionId: "s3",
    storage,
    deps,
    logSet: logSetDuplicate,
    sessionStatus: "in-progress"
  });
  
  assert(outcome3.status === "saved", "Outcome is saved (23505 duplicate)");
  assert(storage.getItem(storageKey("u3")) === null, "Set cleared after 23505");
  console.log("✓ Test 3 passed\n");
  
  // ========================================================================
  // Test 4: Outcome "closed" - session not in progress, keeps set
  // ========================================================================
  console.log("=== Test 4: Outcome closed (session ended) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u4", "s4", set, deps);
  const queueBefore4 = storage.getItem(storageKey("u4"));
  
  const outcome4 = await attemptPendingSet({
    set,
    userId: "u4",
    sessionId: "s4",
    storage,
    deps,
    logSet: logSetOk,
    sessionStatus: "ended"
  });
  
  assert(outcome4.status === "closed", "Outcome is closed");
  assert(storage.getItem(storageKey("u4")) === queueBefore4, "Set kept for closed session");
  console.log("✓ Test 4 passed\n");
  
  // ========================================================================
  // Test 5: Outcome "failed" - network error, keeps set
  // ========================================================================
  console.log("=== Test 5: Outcome failed (network error) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u5", "s5", set, deps);
  const queueBefore5 = storage.getItem(storageKey("u5"));
  
  const logSetFail = async () => {
    throw new Error("Network timeout");
  };
  
  const outcome5 = await attemptPendingSet({
    set,
    userId: "u5",
    sessionId: "s5",
    storage,
    deps,
    logSet: logSetFail,
    sessionStatus: "in-progress"
  });
  
  assert(outcome5.status === "failed", "Outcome is failed");
  assert(outcome5.status === "failed" && outcome5.error === "Network timeout", "Error message correct");
  assert(storage.getItem(storageKey("u5")) === queueBefore5, "Set kept after network error");
  console.log("✓ Test 5 passed\n");
  
  // ========================================================================
  // Test 6: Outcome "expired" - SESSION_EXPIRED error, keeps set
  // ========================================================================
  console.log("=== Test 6: Outcome expired (SESSION_EXPIRED throw) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u6", "s6", set, deps);
  const queueBefore6 = storage.getItem(storageKey("u6"));
  
  const logSetExpiredThrow = async () => {
    throw new Error("SESSION_EXPIRED:token123");
  };
  
  const outcome6 = await attemptPendingSet({
    set,
    userId: "u6",
    sessionId: "s6",
    storage,
    deps,
    logSet: logSetExpiredThrow,
    sessionStatus: "in-progress"
  });
  
  assert(outcome6.status === "expired", "Outcome is expired");
  assert(storage.getItem(storageKey("u6")) === queueBefore6, "Set kept after expired throw");
  console.log("✓ Test 6 passed\n");
  
  // ========================================================================
  // Test 7: Outcome "expired" - SESSION_EXPIRED via result, keeps set
  // ========================================================================
  console.log("=== Test 7: Outcome expired (SESSION_EXPIRED result) ===\n");
  
  storage.clear();
  savePendingSet(storage, "u7", "s7", set, deps);
  const queueBefore7 = storage.getItem(storageKey("u7"));
  
  const logSetExpiredResult = async () => ({ ok: false as const, error: "Session expired", code: "SESSION_EXPIRED" });
  
  const outcome7 = await attemptPendingSet({
    set,
    userId: "u7",
    sessionId: "s7",
    storage,
    deps,
    logSet: logSetExpiredResult,
    sessionStatus: "in-progress"
  });
  
  assert(outcome7.status === "expired", "Outcome is expired (result)");
  assert(storage.getItem(storageKey("u7")) === queueBefore7, "Set kept after expired result");
  console.log("✓ Test 7 passed\n");
  
  console.log(`✅ All pending set outcome tests passed (${passed} assertions)\n`);
  
  console.log("MUTANTS TO TEST:");
  console.log("- Clear set on closed session (must fail)");
  console.log("- Clear set on network error (must fail)");
  console.log("- Clear set on expired (must fail)\n");
  
  process.exit(0);
})();
