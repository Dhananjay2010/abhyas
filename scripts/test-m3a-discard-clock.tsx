#!/usr/bin/env tsx
/**
 * Test M3a mutant: handleDiscard must pass clock to createPendingSetDeps
 * This test seeds OLD-FORMAT data (without timestamp) to prove the clock matters
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
const sessionId = "test-session";
const FIXED_TIME = 1700000000000;

console.log("\nM3a: Clearing old-format data requires clock injection\n");

// Seed OLD-FORMAT data (without timestamp)
const oldFormatData = {
  [sessionId]: [{
    clientId: "set-1",
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  }]
};
storage.setItem(`pending-sets:${userId}`, JSON.stringify(oldFormatData));

console.log("1. Seeded old-format data (no timestamp)");
console.log("   Raw:", storage.getItem(`pending-sets:${userId}`)?.slice(0, 100));

// Load with clock - this migrates the data and adds a timestamp
const depsWithClock = createPendingSetDeps(() => FIXED_TIME);
const loaded = loadAllPendingSetsWithTimestamp(storage, userId, depsWithClock);

console.log("\n2. After loading with clock:");
console.log("   Timestamp:", loaded[sessionId]?.timestamp);
console.log("   Expected:", FIXED_TIME);
console.log("   Match:", loaded[sessionId]?.timestamp === FIXED_TIME);

if (loaded[sessionId]?.timestamp !== FIXED_TIME) {
  console.error("\n❌ FAIL: Migration didn't use injected clock");
  process.exit(1);
}

// Now clear with clock
clearPendingSets(storage, userId, sessionId, depsWithClock);

const remaining = storage.getItem(`pending-sets:${userId}`);
console.log("\n3. After clearing:");
console.log("   Remaining:", remaining || "(null)");

if (remaining !== null && remaining !== "{}") {
  console.error("\n❌ FAIL: Data not properly cleared");
  process.exit(1);
}

console.log("\n✅ PASS: Clock injection works correctly for old-format data\n");
process.exit(0);
