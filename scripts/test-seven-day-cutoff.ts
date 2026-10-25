#!/usr/bin/env tsx
/**
 * Test: 7-day cutoff for stale pending sets
 * 
 * Verifies that pending sets older than 7 days are pruned,
 * while recent sets are kept.
 */

import { loadPendingSets, savePendingSet, type Storage } from "../src/lib/session/pending-set-retry";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

let exitCode = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`❌ ${name}`);
    exitCode = 1;
  }
}

console.log("\nTesting 7-day cutoff with fake clock\n");

const storage = createStorage();
const userId = "user-1";
const sessionId = "sess-1";
const T0 = 1704067200000; // 2024-01-01T00:00:00Z
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

// Test 1: Set saved at T0, loaded at T0 + 7d - 1ms (just before cutoff) should be kept
{
  storage.removeItem(`pending-sets:${userId}`);
  
  const depsAtT0 = { now: () => T0 };
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, depsAtT0);

  const depsBeforeCutoff = { now: () => T0 + sevenDaysMs - 1 };
  const loaded = loadPendingSets(storage, userId, sessionId, depsBeforeCutoff);
  
  check("Set saved at T0, loaded at T0+7d-1ms is kept (just before cutoff)", loaded.length === 1);
}

// Test 2: Set saved at T0, loaded at T0 + 7d (exactly at cutoff) should be pruned
{
  storage.removeItem(`pending-sets:${userId}`);
  
  const depsAtT0 = { now: () => T0 };
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex-2",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-2",
  }, depsAtT0);

  const depsAtCutoff = { now: () => T0 + sevenDaysMs };
  const loaded = loadPendingSets(storage, userId, sessionId, depsAtCutoff);
  
  check("Set saved at T0, loaded at T0+7d is pruned (at cutoff)", loaded.length === 0);
}

// Test 3: Recent set (1 hour old) should always be kept
{
  storage.removeItem(`pending-sets:${userId}`);
  
  const depsAtT0 = { now: () => T0 };
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex-3",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-3",
  }, depsAtT0);

  const oneHour = 60 * 60 * 1000;
  const depsOneHourLater = { now: () => T0 + oneHour };
  const loaded = loadPendingSets(storage, userId, sessionId, depsOneHourLater);
  
  check("Set 1 hour old is kept", loaded.length === 1);
}

console.log(exitCode === 0 ? "\n✅ All 7-day cutoff tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
