/**
const FIXED_TIME = 1700000000000; // Nov 14, 2023
 * Test storage validation.
 * 
 * Verifies:
 * - Invalid JSON is cleared and returns empty
 * - Arrays are rejected (must be object)
 * - Wrong shapes are rejected and storage is cleared
 * - Well-formed data passes validation
 */

import {
  loadAllPendingSets,
  loadPendingSets,
  savePendingSet,
  storageKey,
  type Storage,
} from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = 1700000000000; // Nov 14, 2023

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${expectedStr}`);
    console.error(`   Actual:   ${actualStr}`);
    exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

async function testInvalidJsonCleared() {
  console.log("\n--- Invalid JSON is cleared ---");

  const storage = createStorage();
  storage.setItem(storageKey("test-user-id"), "not valid json{{{");

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result, {}, "Returns empty object for invalid JSON");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Storage key is cleared");
}

async function testArrayRejected() {
  console.log("\n--- Array is rejected (must be object) ---");

  const storage = createStorage();
  storage.setItem(storageKey("test-user-id"), JSON.stringify([{ sessionId: "foo" }]));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result, {}, "Returns empty object for array");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Storage key is cleared");
}

async function testWrongShapeRejected() {
  console.log("\n--- Wrong shape is rejected ---");

  const storage = createStorage();
  
  // Test 1: sessionId maps to object instead of array
  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({ "session-1": { setNumber: 1 } })
  );

  let result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));
  assertEqual(result, {}, "Rejects object instead of array");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Storage cleared");

  // Test 2: Missing required fields
  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      "session-2": [
        {
          sessionExerciseId: "ex-1",
          setNumber: 1,
          // missing reps, weightKg, durationSeconds, clientId
        },
      ],
    })
  );

  result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));
  assertEqual(result, {}, "Rejects sets with missing fields");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Storage cleared");

  // Test 3: Wrong field types
  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      "session-3": [
        {
          sessionExerciseId: "ex-1",
          setNumber: "not a number",
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-1",
        },
      ],
    })
  );

  result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));
  assertEqual(result, {}, "Rejects sets with wrong field types");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Storage cleared");
}

async function testWellFormedDataPasses() {
  console.log("\n--- Well-formed data passes validation ---");

  const storage = createStorage();
  
  const wellFormed = {
    "session-1": [
      {
        sessionExerciseId: "ex-1",
        setNumber: 1,
        reps: 10,
        weightKg: 50,
        durationSeconds: null,
        clientId: "client-1",
      },
      {
        sessionExerciseId: "ex-1",
        setNumber: 2,
        reps: null,
        weightKg: null,
        durationSeconds: 30,
        clientId: "client-2",
      },
    ],
    "session-2": [
      {
        sessionExerciseId: "ex-2",
        setNumber: 1,
        reps: null,
        weightKg: 0,
        durationSeconds: null,
        clientId: "client-3",
      },
    ],
  };

  storage.setItem(storageKey("test-user-id"), JSON.stringify(wellFormed));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result, wellFormed, "Returns well-formed data unchanged");
  assert(storage.getItem(storageKey("test-user-id")) !== null, "Storage not cleared");
}

async function testLoadPendingSetsWithInvalidStorage() {
  console.log("\n--- loadPendingSets handles invalid storage ---");

  const storage = createStorage();
  storage.setItem(storageKey("test-user-id"), "invalid json");

  const result = loadPendingSets(storage, "test-user-id", "session-1", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result, [], "Returns empty array when storage is invalid");
  assertEqual(storage.getItem(storageKey("test-user-id")), null, "Invalid storage is cleared");
}

async function testSavePendingSetValidation() {
  console.log("\n--- savePendingSet after invalid storage ---");

  const storage = createStorage();
  
  // Put invalid data in storage
  storage.setItem(storageKey("test-user-id"), "not valid");

  // Save a valid set - should clear bad data and save new set
  savePendingSet(storage, "test-user-id", "session-1", {
    sessionExerciseId: "ex-1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-1",
  }, createPendingSetDeps(() => FIXED_TIME));

  const loaded = loadPendingSets(storage, "test-user-id", "session-1", createPendingSetDeps(() => FIXED_TIME));
  assertEqual(loaded.length, 1, "Set saved despite invalid prior storage");
  assertEqual(loaded[0]?.setNumber, 1, "Correct set loaded");
}

async function testNullFieldsValid() {
  console.log("\n--- Null fields are valid ---");

  const storage = createStorage();
  
  const withNulls = {
    "session-1": [
      {
        sessionExerciseId: "ex-1",
        setNumber: 1,
        reps: null,
        weightKg: null,
        durationSeconds: null,
        clientId: "client-1",
      },
    ],
  };

  storage.setItem(storageKey("test-user-id"), JSON.stringify(withNulls));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result, withNulls, "Null fields are accepted");
}

async function testExtraFieldsIgnored() {
  console.log("\n--- Extra fields are ignored (accepted) ---");

  const storage = createStorage();
  
  const withExtra = {
    "session-1": [
      {
        sessionExerciseId: "ex-1",
        setNumber: 1,
        reps: 10,
        weightKg: 50,
        durationSeconds: null,
        clientId: "client-1",
        extraField: "ignored",
        anotherExtra: 123,
      },
    ],
  };

  storage.setItem(storageKey("test-user-id"), JSON.stringify(withExtra));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assert(result["session-1"]?.[0]?.setNumber === 1, "Data with extra fields is accepted");
}

async function testStaleEntriesPruned() {
  console.log("\n--- Stale entries are pruned ---");

  const storage = createStorage();
  
  const eightDaysAgo = 1700000000000 - (8 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = 1700000000000 - (2 * 24 * 60 * 60 * 1000);
  
  // Directly store timestamped format with old and recent entries
  const withStale = {
    "old-session": {
      sets: [
        {
          sessionExerciseId: "ex-1",
          setNumber: 1,
          reps: 10,
          weightKg: 50,
          durationSeconds: null,
          clientId: "client-old",
        },
      ],
      timestamp: eightDaysAgo,
    },
    "recent-session": {
      sets: [
        {
          sessionExerciseId: "ex-2",
          setNumber: 1,
          reps: 12,
          weightKg: 60,
          durationSeconds: null,
          clientId: "client-recent",
        },
      ],
      timestamp: twoDaysAgo,
    },
  };

  storage.setItem(storageKey("test-user-id"), JSON.stringify(withStale));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assert(result["old-session"] === undefined, "Stale session (>7 days) is pruned");
  assert(result["recent-session"] !== undefined, "Recent session is kept");
  assertEqual(result["recent-session"]?.length, 1, "Recent session has correct data");
}

async function testLegacyFormatMigrated() {
  console.log("\n--- Legacy format is migrated to timestamped ---");

  const storage = createStorage();
  
  // Old format: plain object of arrays
  const legacyFormat = {
    "session-1": [
      {
        sessionExerciseId: "ex-1",
        setNumber: 1,
        reps: 10,
        weightKg: 50,
        durationSeconds: null,
        clientId: "client-1",
      },
    ],
  };

  storage.setItem(storageKey("test-user-id"), JSON.stringify(legacyFormat));

  const result = loadAllPendingSets(storage, "test-user-id", createPendingSetDeps(() => FIXED_TIME));

  assertEqual(result["session-1"]?.length, 1, "Legacy data migrated successfully");
  assertEqual(result["session-1"]?.[0]?.setNumber, 1, "Data intact after migration");

  // Verify storage was updated to timestamped format
  const raw = storage.getItem(storageKey("test-user-id"));
  assert(raw !== null, "Storage not removed");
  if (!raw) throw new Error("Migration: raw storage value is null after assertion passed");
  const parsed = JSON.parse(raw);
  assert(parsed["session-1"]?.timestamp !== undefined, "Timestamp added during migration");
  assert(Array.isArray(parsed["session-1"]?.sets), "Sets wrapped in timestamped structure");
}

async function testTimestampUpdatedOnSave() {
  console.log("\n--- Timestamp updated when saving new set ---");

  const storage = createStorage();
  
  const oldTimestamp = 1700000000000 - (1000 * 60); // 1 minute ago
  
  storage.setItem(
    storageKey("test-user-id"),
    JSON.stringify({
      "session-1": {
        sets: [
          {
            sessionExerciseId: "ex-1",
            setNumber: 1,
            reps: 10,
            weightKg: 50,
            durationSeconds: null,
            clientId: "client-1",
          },
        ],
        timestamp: oldTimestamp,
      },
    })
  );

  // Save a new set
  savePendingSet(storage, "test-user-id", "session-1", {
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 12,
    weightKg: 50,
    durationSeconds: null,
    clientId: "client-2",
  }, createPendingSetDeps(() => FIXED_TIME));

  const raw = storage.getItem(storageKey("test-user-id"));
  if (!raw) throw new Error("Timestamp update: raw storage value is null");
  const parsed = JSON.parse(raw);
  
  assert(parsed["session-1"].timestamp > oldTimestamp, "Timestamp updated on save");
  assertEqual(parsed["session-1"].sets.length, 2, "New set added");
}

async function main() {
  console.log("Testing storage validation\n");

  await testInvalidJsonCleared();
  await testArrayRejected();
  await testWrongShapeRejected();
  await testWellFormedDataPasses();
  await testLoadPendingSetsWithInvalidStorage();
  await testSavePendingSetValidation();
  await testNullFieldsValid();
  await testExtraFieldsIgnored();
  await testStaleEntriesPruned();
  await testLegacyFormatMigrated();
  await testTimestampUpdatedOnSave();

  console.log(
    exitCode === 0 ? "\n✅ All tests passed" : "\n❌ Some tests failed"
  );
  process.exit(exitCode);
}

main();
