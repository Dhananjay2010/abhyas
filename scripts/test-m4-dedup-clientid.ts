/**
 * M4: Test clientId dedup in savePendingSet
 * 
 * PLANTED BUG: Remove dedup check → saves duplicate sets
 */

import { savePendingSet, loadPendingSets, type PendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = 1700000000000;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n  🐛 ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✓ ${message}`);
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

console.log("\n🧪 M4 TEST: clientId dedup prevents duplicate saves\n");

const storage = new FakeStorage();
const deps = createPendingSetDeps(() => FIXED_TIME);

const set1: PendingSet = {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 60,
  durationSeconds: null,
  clientId: "ex-1:1:1700000000000",
};

// Save set once
savePendingSet(storage, "user-1", "session-1", set1, deps);
let loaded = loadPendingSets(storage, "user-1", "session-1", deps);
assert(loaded.length === 1, "First save: 1 set in storage");

// Try to save the SAME clientId again (duplicate)
savePendingSet(storage, "user-1", "session-1", set1, deps);
loaded = loadPendingSets(storage, "user-1", "session-1", deps);
assert(loaded.length === 1, "M4: Duplicate clientId NOT saved (dedup works)");

// Different clientId should be saved
const set2: PendingSet = {
  ...set1,
  setNumber: 2,
  clientId: "ex-1:2:1700000001000",
};
savePendingSet(storage, "user-1", "session-1", set2, deps);
loaded = loadPendingSets(storage, "user-1", "session-1", deps);
assert(loaded.length === 2, "Different clientId: 2 sets in storage");

console.log("\n✅ M4 TEST PASSED: clientId dedup working correctly\n");
console.log("PLANTED BUG: Remove clientId dedup → allows duplicate submissions\n");

process.exit(0);

