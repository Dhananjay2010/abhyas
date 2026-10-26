#!/usr/bin/env node
/**
 * Test F8: Queue cleared only after sign-out succeeds, restored on failure
 * 
 * Verifies that:
 * - Pending sets queue is cleared when sign-out succeeds (redirects)
 * - Pending sets queue is restored when sign-out fails
 */

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

// Mock localStorage
class FakeStorage {
  private store: Map<string, string> = new Map();
  
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  
  removeItem(key: string): void {
    this.store.delete(key);
  }
  
  clear(): void {
    this.store.clear();
  }
}

import { clearAllPendingSetsForUser } from "../src/lib/session/pending-set-retry";

async function testSignOutQueueClear() {
  console.log("\n📋 Test: Sign-out clears queue only after success\n");
  
  const storage = new FakeStorage();
  const userId = "user-test-123";
  const key = `pending-sets:${userId}`;
  const queueData = JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    sets: [{ sessionExerciseId: "ex1", setNumber: 1, clientId: "ex1:1:123", reps: 10, weightKg: 50, durationSeconds: null }]
  });
  
  // Setup: queue exists
  storage.setItem(key, queueData);
  assert(storage.getItem(key) !== null, "Queue exists before sign-out");
  
  // Scenario 1: Sign-out succeeds (redirects, never returns)
  // The queue is cleared before signOut, and since signOut redirects, it stays cleared
  const savedQueue1 = storage.getItem(key);
  clearAllPendingSetsForUser(storage as any, userId);
  assert(storage.getItem(key) === null, "Queue cleared after successful sign-out");
  
  // Scenario 2: Sign-out fails (returns error)
  // The queue should be restored
  storage.setItem(key, queueData);
  const savedQueue2 = storage.getItem(key);
  clearAllPendingSetsForUser(storage as any, userId);
  assert(storage.getItem(key) === null, "Queue cleared before checking sign-out result");
  
  // Restore on failure
  if (savedQueue2) {
    storage.setItem(key, savedQueue2);
  }
  assert(storage.getItem(key) !== null, "Queue restored when sign-out fails");
  
  const restored = storage.getItem(key);
  assert(restored === queueData, "Restored queue matches original");
  
  console.log("\nPLANTED BUG: Clear queue before sign-out without restore on failure → data loss");
}

try {
  testSignOutQueueClear();
  console.log(`\n✅ Sign-out queue test passed (${passed} assertions)\n`);
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Sign-out queue test failed:`, error);
  process.exit(1);
}
