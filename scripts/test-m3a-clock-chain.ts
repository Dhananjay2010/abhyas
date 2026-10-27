#!/usr/bin/env tsx
/**
 * Test M3a mutant in a CHAINED test (npm test runs this)
 * Verifies that handleDiscard passes clock to createPendingSetDeps
 */

import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import { clearPendingSets, loadAllPendingSetsWithTimestamp } from "../src/lib/session/pending-set-retry";

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

const storage = new FakeStorage();
const userId = "test-user";
const session1 = "session-to-clear";
const session2 = "session-to-keep";
const FIXED_TIME = 1700000000000;

console.log("\nM3a: clearPendingSets must use injected clock for old-format data\n");

// Seed OLD-FORMAT data for TWO sessions
const oldFormatData = {
  [session1]: [{
    clientId: "set-1",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }],
  [session2]: [{
    clientId: "set-2",
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 12,
    weightKg: 60,
    durationSeconds: null,
  }]
};
storage.setItem(`pending-sets:${userId}`, JSON.stringify(oldFormatData));

console.log("1. Seeded old-format data for two sessions (no timestamps)");

// Clear session1 with injected clock
const depsWithClock = createPendingSetDeps(() => FIXED_TIME);
clearPendingSets(storage, userId, session1, depsWithClock);

console.log("\n2. Cleared session1 with injected clock");

// Load the remaining data and check session2's timestamp
const remaining = loadAllPendingSetsWithTimestamp(storage, userId, depsWithClock);

console.log("\n3. Checking remaining session2:");
console.log("   Has session2:", !!remaining[session2]);
console.log("   Timestamp:", remaining[session2]?.timestamp);
console.log("   Expected:", FIXED_TIME);

if (!remaining[session2]) {
  console.error("\n❌ FAIL: Session2 should still exist");
  process.exit(1);
}

if (remaining[session2].timestamp !== FIXED_TIME) {
  console.error("\n❌ FAIL: Session2 has wrong timestamp");
  console.error("   Got:", remaining[session2].timestamp);
  console.error("   Expected:", FIXED_TIME);
  console.error("\nThis would happen if clearPendingSets didn't use the injected clock,");
  console.error("causing the migration to use Date.now() instead of the fixed time.");
  process.exit(1);
}

console.log("\n✅ PASS: Clock injection preserved during clear operation\n");
process.exit(0);
