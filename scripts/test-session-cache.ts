#!/usr/bin/env tsx
/**
 * Test session cache helpers: versioning, corrupt data, merge with outbox
 */

import {
  writeSessionSnapshot,
  readSessionSnapshot,
  mergeSnapshotWithOutbox,
  type SessionSnapshot,
  type SessionCacheStorage,
} from "../src/lib/session/session-cache";

// Fake storage for testing
class FakeStorage implements SessionCacheStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  clear() {
    this.data.clear();
  }
}

async function main() {
  console.log("Testing session cache helpers...\n");

  // Test 1: Round-trip (write and read)
  const storage = new FakeStorage();
  const snapshot = {
    sessionId: "session-1",
    userId: "user-1",
    exercises: [
      {
        id: "ex-1",
        exerciseId: "exercise-123",
        name: "Squat",
        plannedSets: 3,
        sets: [
          { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 100, durationSeconds: null },
        ],
      },
    ],
    elapsed: 300,
  };

  writeSessionSnapshot(storage, snapshot);
  const read = readSessionSnapshot(storage, "session-1");

  if (!read) {
    throw new Error("Round-trip: Failed to read snapshot");
  }
  if (read.sessionId !== "session-1") {
    throw new Error("Round-trip: sessionId mismatch");
  }
  if (read.exercises.length !== 1) {
    throw new Error("Round-trip: exercises length mismatch");
  }
  if (read.exercises[0].sets.length !== 2) {
    throw new Error("Round-trip: sets length mismatch");
  }
  if (read.version !== 1) {
    throw new Error("Round-trip: version mismatch");
  }

  console.log("✓ Round-trip: write and read works");

  // Test 2: Corrupt data returns null
  storage.clear();
  storage.setItem("abhyas:session:session-2", "not-valid-json{");
  const corrupt = readSessionSnapshot(storage, "session-2");

  if (corrupt !== null) {
    throw new Error("Corrupt data should return null");
  }

  console.log("✓ Corrupt JSON returns null");

  // Test 3: Version mismatch returns null
  storage.clear();
  storage.setItem(
    "abhyas:session:session-3",
    JSON.stringify({ version: 999, sessionId: "session-3", userId: "user-1", exercises: [], elapsed: 0 })
  );
  const versionMismatch = readSessionSnapshot(storage, "session-3");

  if (versionMismatch !== null) {
    throw new Error("Version mismatch should return null");
  }

  console.log("✓ Version mismatch returns null");

  // Test 4: Merge with outbox (no duplicates by setNumber)
  const baseSnapshot: SessionSnapshot = {
    version: 1,
    sessionId: "session-4",
    userId: "user-1",
    exercises: [
      {
        id: "ex-1",
        exerciseId: "exercise-123",
        name: "Squat",
        plannedSets: 3,
        sets: [
          { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 100, durationSeconds: null },
        ],
      },
    ],
    elapsed: 300,
    createdAt: Date.now(),
  };

  const queuedSets = [
    // Update set 2 (should override)
    {
      sessionExerciseId: "ex-1",
      setNumber: 2,
      reps: 12,
      weightKg: 110,
      durationSeconds: null,
      pending: true,
    },
    // New set 3
    {
      sessionExerciseId: "ex-1",
      setNumber: 3,
      reps: 8,
      weightKg: 110,
      durationSeconds: null,
      pending: true,
    },
  ];

  const merged = mergeSnapshotWithOutbox(baseSnapshot, queuedSets);

  if (merged.exercises[0].sets.length !== 3) {
    throw new Error(`Merge: Expected 3 sets, got ${merged.exercises[0].sets.length}`);
  }

  // Check set 1 unchanged
  if (merged.exercises[0].sets[0].reps !== 10 || merged.exercises[0].sets[0].weightKg !== 100) {
    throw new Error("Merge: Set 1 should be unchanged");
  }

  // Check set 2 updated
  if (merged.exercises[0].sets[1].reps !== 12 || merged.exercises[0].sets[1].weightKg !== 110) {
    throw new Error("Merge: Set 2 should be updated from queue");
  }
  if (!merged.exercises[0].sets[1].pending) {
    throw new Error("Merge: Set 2 should have pending flag");
  }

  // Check set 3 added
  if (merged.exercises[0].sets[2].reps !== 8 || merged.exercises[0].sets[2].weightKg !== 110) {
    throw new Error("Merge: Set 3 should be added from queue");
  }

  console.log("✓ Merge with outbox: no duplicates, correct override");

  // Test 5: Merge with different exercise (no conflict)
  const queuedForDifferentEx = [
    {
      sessionExerciseId: "ex-2",
      setNumber: 1,
      reps: 15,
      weightKg: 50,
      durationSeconds: null,
      failed: true,
    },
  ];

  const merged2 = mergeSnapshotWithOutbox(baseSnapshot, queuedForDifferentEx);

  if (merged2.exercises[0].sets.length !== 2) {
    throw new Error("Merge different exercise: original exercise should be unchanged");
  }

  console.log("✓ Merge different exercise: no conflict");

  console.log("\n✓ All session cache tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
