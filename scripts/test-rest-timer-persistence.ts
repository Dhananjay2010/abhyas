#!/usr/bin/env tsx
/**
 * Test rest-timer-persistence pure functions
 *
 * Covers:
 * - Save then load in the future returns the record
 * - Load once now() >= restEndsAt returns null and removes the key
 * - A different session id returns null
 * - Corrupt JSON returns null with the key removed
 * - Storage that throws returns null without throwing
 * - Clear removes the key
 */

import {
  saveRest,
  loadRest,
  clearRest,
  type StorageAdapter,
  type RestRecord,
} from "../src/lib/session/rest-timer-persistence";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test rest-timer-persistence pure functions:\n");

// Fake storage for testing
function createFakeStorage(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

// ===== CASE 1: Save then load in the future returns the record =====
console.log("Case 1: Save then load in the future returns the record");

const storage1 = createFakeStorage();
const sessionId1 = "session-1";
const record1: RestRecord = {
  sessionId: sessionId1,
  sessionExerciseId: "exercise-1",
  setNumber: 2,
  restEndsAt: 1000000,
};

saveRest(storage1, record1);
check("Storage contains the key", storage1.data.has("abhyas:rest:session-1"));

const loaded1 = loadRest(storage1, sessionId1, () => 999000);
check("Loaded record matches saved record", loaded1 !== null && loaded1.restEndsAt === 1000000);
check("Loaded record has correct session id", loaded1?.sessionId === sessionId1);
check("Loaded record has correct exercise id", loaded1?.sessionExerciseId === "exercise-1");
check("Loaded record has correct set number", loaded1?.setNumber === 2);

// ===== CASE 2: Load once now() >= restEndsAt returns null and removes the key =====
console.log("\nCase 2: Load once now() >= restEndsAt returns null and removes the key");

const storage2 = createFakeStorage();
const sessionId2 = "session-2";
const record2: RestRecord = {
  sessionId: sessionId2,
  sessionExerciseId: "exercise-2",
  setNumber: 1,
  restEndsAt: 1000000,
};

saveRest(storage2, record2);
check("Storage contains the key before expiry", storage2.data.has("abhyas:rest:session-2"));

// Load after expiry
const loaded2 = loadRest(storage2, sessionId2, () => 1000000);
check("Expired load returns null", loaded2 === null);
check("Expired load removes the key", !storage2.data.has("abhyas:rest:session-2"));

// Load at exact expiry time
const storage2b = createFakeStorage();
saveRest(storage2b, record2);
const loaded2b = loadRest(storage2b, sessionId2, () => 1000000);
check("Load at exact expiry returns null", loaded2b === null);
check("Load at exact expiry removes the key", !storage2b.data.has("abhyas:rest:session-2"));

// ===== CASE 3: A different session id returns null =====
console.log("\nCase 3: A different session id returns null");

const storage3 = createFakeStorage();
const record3: RestRecord = {
  sessionId: "session-3",
  sessionExerciseId: "exercise-3",
  setNumber: 1,
  restEndsAt: 1000000,
};

saveRest(storage3, record3);
const loaded3 = loadRest(storage3, "different-session", () => 999000);
check("Different session id returns null", loaded3 === null);
check("Key not removed for different session", storage3.data.has("abhyas:rest:session-3"));

// ===== CASE 4: Corrupt JSON returns null with the key removed =====
console.log("\nCase 4: Corrupt JSON returns null with the key removed");

const storage4 = createFakeStorage();
const sessionId4 = "session-4";
storage4.data.set("abhyas:rest:session-4", "{invalid json");

const loaded4 = loadRest(storage4, sessionId4, () => 999000);
check("Corrupt JSON returns null", loaded4 === null);
check("Corrupt JSON removes the key", !storage4.data.has("abhyas:rest:session-4"));

// Missing fields
const storage4b = createFakeStorage();
storage4b.data.set("abhyas:rest:session-4", JSON.stringify({ sessionId: sessionId4 }));
const loaded4b = loadRest(storage4b, sessionId4, () => 999000);
check("Missing restEndsAt returns null", loaded4b === null);

// ===== CASE 5: Storage that throws returns null without throwing =====
console.log("\nCase 5: Storage that throws returns null without throwing");

const throwingStorage: StorageAdapter = {
  getItem: () => {
    throw new Error("Storage unavailable");
  },
  setItem: () => {
    throw new Error("Storage unavailable");
  },
  removeItem: () => {
    throw new Error("Storage unavailable");
  },
};

// Save should not throw
try {
  saveRest(throwingStorage, record1);
  check("saveRest does not throw when storage throws", true);
} catch (err) {
  check("saveRest does not throw when storage throws", false, String(err));
}

// Load should not throw
try {
  const loaded5 = loadRest(throwingStorage, "session-5", () => 999000);
  check("loadRest does not throw when storage throws", true);
  check("loadRest returns null when storage throws", loaded5 === null);
} catch (err) {
  check("loadRest does not throw when storage throws", false, String(err));
}

// Clear should not throw
try {
  clearRest(throwingStorage, "session-5");
  check("clearRest does not throw when storage throws", true);
} catch (err) {
  check("clearRest does not throw when storage throws", false, String(err));
}

// ===== CASE 6: Clear removes the key =====
console.log("\nCase 6: Clear removes the key");

const storage6 = createFakeStorage();
const sessionId6 = "session-6";
const record6: RestRecord = {
  sessionId: sessionId6,
  sessionExerciseId: "exercise-6",
  setNumber: 1,
  restEndsAt: 1000000,
};

saveRest(storage6, record6);
check("Key exists before clear", storage6.data.has("abhyas:rest:session-6"));

clearRest(storage6, sessionId6);
check("Key removed after clear", !storage6.data.has("abhyas:rest:session-6"));

console.log("\n✅ All tests passed");
