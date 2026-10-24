#!/usr/bin/env tsx
/**
 * Test: reload while offline restores session from snapshot + outbox
 *
 * Verifies that a session can be resumed offline by reading the cached snapshot
 * and merging it with queued sets from the outbox.
 */

import {
  writeSessionSnapshot,
  readSessionSnapshot,
  mergeSnapshotWithOutbox,
  type SessionCacheStorage,
} from "../src/lib/session/session-cache";

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
  console.log("Testing offline reload with snapshot + outbox...\n");

  const storage = new FakeStorage();
  const sessionId = "session-offline-1";
  const userId = "user-1";

  // Scenario: User logs 2 sets online, then goes offline and logs 2 more sets queued

  // Step 1: Write a snapshot after logging 2 sets (simulating online session)
  const initialSnapshot = {
    sessionId,
    userId,
    exercises: [
      {
        id: "ex-1",
        exerciseId: "exercise-squat",
        name: "Barbell Squat",
        plannedSets: 4,
        sets: [
          { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
          { setNumber: 2, reps: 10, weightKg: 100, durationSeconds: null },
        ],
      },
    ],
    elapsed: 180,
  };

  writeSessionSnapshot(storage, initialSnapshot);
  console.log("✓ Initial snapshot written (2 sets logged online)");

  // Step 2: Simulate going offline and queuing 2 more sets in the outbox
  const queuedSets = [
    {
      sessionExerciseId: "ex-1",
      setNumber: 3,
      reps: 12,
      weightKg: 105,
      durationSeconds: null,
      pending: true,
      clientId: "client-1",
    },
    {
      sessionExerciseId: "ex-1",
      setNumber: 4,
      reps: 11,
      weightKg: 105,
      durationSeconds: null,
      pending: true,
      clientId: "client-2",
    },
  ];

  console.log("✓ Simulated offline: 2 sets queued in outbox");

  // Step 3: Reload (F5) while offline - read snapshot and merge with outbox
  const snapshot = readSessionSnapshot(storage, sessionId);

  if (!snapshot) {
    throw new Error("Failed to read snapshot after offline reload");
  }

  const restored = mergeSnapshotWithOutbox(snapshot, queuedSets);

  // Verify the merged result
  if (restored.exercises.length !== 1) {
    throw new Error(`Expected 1 exercise, got ${restored.exercises.length}`);
  }

  const exercise = restored.exercises[0];

  if (exercise.sets.length !== 4) {
    throw new Error(`Expected 4 sets total, got ${exercise.sets.length}`);
  }

  // Check set 1 (from snapshot)
  if (exercise.sets[0].setNumber !== 1 || exercise.sets[0].reps !== 10 || exercise.sets[0].weightKg !== 100) {
    throw new Error("Set 1 mismatch");
  }
  const set1Meta = exercise.sets[0] as unknown as { pending?: boolean };
  if (set1Meta.pending) {
    throw new Error("Set 1 should not be pending (it was logged online)");
  }

  // Check set 2 (from snapshot)
  if (exercise.sets[1].setNumber !== 2 || exercise.sets[1].reps !== 10 || exercise.sets[1].weightKg !== 100) {
    throw new Error("Set 2 mismatch");
  }

  // Check set 3 (from outbox)
  if (exercise.sets[2].setNumber !== 3 || exercise.sets[2].reps !== 12 || exercise.sets[2].weightKg !== 105) {
    throw new Error("Set 3 mismatch");
  }
  const set3Meta = exercise.sets[2] as unknown as { pending?: boolean; clientId?: string };
  if (!set3Meta.pending) {
    throw new Error("Set 3 should be pending (from outbox)");
  }
  if (set3Meta.clientId !== "client-1") {
    throw new Error("Set 3 clientId mismatch");
  }

  // Check set 4 (from outbox)
  if (exercise.sets[3].setNumber !== 4 || exercise.sets[3].reps !== 11 || exercise.sets[3].weightKg !== 105) {
    throw new Error("Set 4 mismatch");
  }
  const set4Meta = exercise.sets[3] as unknown as { pending?: boolean };
  if (!set4Meta.pending) {
    throw new Error("Set 4 should be pending (from outbox)");
  }

  console.log("✓ Offline reload: snapshot + outbox merged correctly");
  console.log(`  - Sets 1-2: from snapshot (logged online)`);
  console.log(`  - Sets 3-4: from outbox (pending)`);

  // Step 4: Test override scenario - queued set updates a snapshot set
  const updateSnapshot = {
    sessionId: "session-override",
    userId,
    exercises: [
      {
        id: "ex-2",
        exerciseId: "exercise-press",
        name: "Overhead Press",
        plannedSets: 3,
        sets: [
          { setNumber: 1, reps: 8, weightKg: 50, durationSeconds: null },
          { setNumber: 2, reps: 8, weightKg: 50, durationSeconds: null },
        ],
      },
    ],
    elapsed: 120,
  };

  writeSessionSnapshot(storage, updateSnapshot);

  // Queued set 2 with updated weight (user retried after initial attempt failed)
  const updateQueuedSets = [
    {
      sessionExerciseId: "ex-2",
      setNumber: 2,
      reps: 9,
      weightKg: 52.5,
      durationSeconds: null,
      pending: true,
      clientId: "client-3",
    },
  ];

  const updateRestored = mergeSnapshotWithOutbox(
    readSessionSnapshot(storage, "session-override")!,
    updateQueuedSets
  );

  // Set 2 should be overridden by queued version
  if (updateRestored.exercises[0].sets[1].weightKg !== 52.5) {
    throw new Error("Queued set should override snapshot set by setNumber");
  }
  if (updateRestored.exercises[0].sets[1].reps !== 9) {
    throw new Error("Queued set reps should override snapshot");
  }

  console.log("✓ Override scenario: queued set correctly overrides snapshot set");

  console.log("\n✓ All offline reload tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
