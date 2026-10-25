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

// PLANTED BUG SIMULATION
console.log("🐛 PLANTED BUG: Remove dedup check\n");

function savePendingSetBuggy(
  storage: Storage,
  userId: string,
  sessionId: string,
  set: PendingSet,
  deps: { now: () => number }
) {
  const key = `pending_sets_${userId}_${sessionId}`;
  const existing = JSON.parse(storage.getItem(key) || '{"sets":[],"timestamp":0}');
  // BUG: Skip dedup check, just append
  existing.sets.push(set);
  existing.timestamp = deps.now();
  storage.setItem(key, JSON.stringify(existing));
}

const storage2 = new FakeStorage();
savePendingSetBuggy(storage2, "user-1", "session-1", set1, deps);
const key = `pending_sets_user-1_session-1`;
let raw = JSON.parse(storage2.getItem(key) || '{"sets":[]}');
assert(raw.sets.length === 1, "Buggy first save: 1 set");

savePendingSetBuggy(storage2, "user-1", "session-1", set1, deps);
raw = JSON.parse(storage2.getItem(key) || '{"sets":[]}');

try {
  assert(raw.sets.length === 1, "M4 BUGGY: Should have 1 set, has " + raw.sets.length);
  console.error("\n❌ PLANTED BUG TEST FAILED: Expected assertion to fail!");
  process.exit(1);
} catch {
  console.log("✅ M4 PLANTED BUG CAUGHT: Duplicate clientId saved when dedup removed!");
  console.log(`   Expected: 1 set`);
  console.log(`   Got:      ${raw.sets.length} sets (DUPLICATE!)`);
  console.log("   This causes replay to submit the same set twice.\n");
  process.exit(0);
}
