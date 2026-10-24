#!/usr/bin/env tsx
/**
 * Test: 7-day cutoff for stale pending sets
 * 
 * Verifies that pending sets older than 7 days are pruned,
 * while recent sets are kept.
 */

import { loadPendingSets, savePendingSet, type Storage } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

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

// Create deps with fake clock
const realNow = Date.now();
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

// Test 1: Set saved exactly 7 days ago should be pruned
const deps7Days = createPendingSetDeps({ nowMs: () => realNow });
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-7days",
}, deps7Days);

// Move clock forward exactly 7 days
const deps7DaysLater = createPendingSetDeps({ nowMs: () => realNow + sevenDaysMs });
const loaded7Days = loadPendingSets(storage, userId, sessionId, deps7DaysLater);
check("Set exactly 7 days old is pruned", loaded7Days.length === 0);

// Test 2: Set saved 6 days 23 hours ago should be kept
storage.removeItem(`pending-sets:${userId}`);
const deps6Days = createPendingSetDeps({ nowMs: () => realNow });
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-2",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-6days",
}, deps6Days);

// Move clock forward 6 days 23 hours
const almostSevenDays = sevenDaysMs - (60 * 60 * 1000); // 6 days 23 hours
const depsAlmost7Days = createPendingSetDeps({ nowMs: () => realNow + almostSevenDays });
const loadedAlmost7Days = loadPendingSets(storage, userId, sessionId, depsAlmost7Days);
check("Set 6 days 23 hours old is kept", loadedAlmost7Days.length === 1);

// Test 3: Set saved 8 days ago should be pruned
storage.removeItem(`pending-sets:${userId}`);
const deps8Days = createPendingSetDeps({ nowMs: () => realNow });
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-3",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-8days",
}, deps8Days);

// Move clock forward 8 days
const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
const deps8DaysLater = createPendingSetDeps({ nowMs: () => realNow + eightDaysMs });
const loaded8Days = loadPendingSets(storage, userId, sessionId, deps8DaysLater);
check("Set 8 days old is pruned", loaded8Days.length === 0);

// Test 4: Recent set (1 hour old) should be kept
storage.removeItem(`pending-sets:${userId}`);
const depsRecent = createPendingSetDeps({ nowMs: () => realNow });
savePendingSet(storage, userId, sessionId, {
  sessionExerciseId: "ex-4",
  setNumber: 1,
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  clientId: "client-recent",
}, depsRecent);

// Move clock forward 1 hour
const oneHourMs = 60 * 60 * 1000;
const depsOneHour = createPendingSetDeps({ nowMs: () => realNow + oneHourMs });
const loadedRecent = loadPendingSets(storage, userId, sessionId, depsOneHour);
check("Set 1 hour old is kept", loadedRecent.length === 1);

console.log(exitCode === 0 ? "\n✅ All 7-day cutoff tests passed" : "\n❌ Some tests failed");
process.exit(exitCode);
