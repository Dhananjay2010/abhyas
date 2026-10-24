#!/usr/bin/env tsx
/**
 * Test offline-safe set logging: outbox queuing, order preservation, and error handling.
 *
 * Verifies:
 * 1. Sets queued offline are persisted and flushed on reconnect
 * 2. Client-side dedup: same exercise+setNumber not queued twice
 * 3. Permanent errors (validation) are moved to failed list
 * 4. Transient errors (network) keep sets in queue
 * 5. Concurrent flushes are guarded (only one runs)
 * 6. mergePendingSets correctly merges pending sets into exercises
 */

import { Outbox, mergePendingSets, type OutboxStorage, type OutboxSender, type QueuedSet, type SendResult } from "../src/lib/session/outbox";

// ---- Fake storage --------------------------------------------------------
class FakeStorage implements OutboxStorage {
  private state: ReturnType<OutboxStorage["get"]> = null;

  get() {
    // Return a deep copy to match localStorage behavior (JSON round-trip)
    return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
  }

  set(state: ReturnType<OutboxStorage["get"]>) {
    // Store a deep copy to match localStorage behavior
    this.state = state ? JSON.parse(JSON.stringify(state)) : null;
  }

  clear() {
    this.state = null;
  }
}

// ---- Fake sender ---------------------------------------------------------
type SentSet = Omit<QueuedSet, "clientId" | "queuedAt" | "retries"> & { sentAt: number };

class FakeSender implements OutboxSender {
  sent: SentSet[] = [];
  private shouldFail: "none" | "transient" | "permanent" = "none";
  private failCount = 0;
  private delayMs = 0;
  callCount = 0;

  async send(set: Omit<QueuedSet, "clientId" | "queuedAt" | "retries">): Promise<SendResult> {
    this.callCount++;

    // Simulate delay if set
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail === "transient") {
      this.failCount++;
      return { ok: false, permanent: false, error: "Network timeout" };
    }
    if (this.shouldFail === "permanent") {
      this.failCount++;
      return { ok: false, permanent: true, error: "Invalid reps: must be positive" };
    }

    // Server-side: upsert with onConflict on (session_exercise_id, set_number, is_warmup_set)
    // A replay of the same exercise+setNumber overwrites with identical values
    const existing = this.sent.find(
      (s) => s.sessionExerciseId === set.sessionExerciseId && s.setNumber === set.setNumber,
    );
    if (existing) {
      // Upsert: overwrite existing
      existing.reps = set.reps;
      existing.weightKg = set.weightKg;
      existing.durationSeconds = set.durationSeconds;
      existing.sentAt = Date.now();
    } else {
      this.sent.push({ ...set, sentAt: Date.now() });
    }

    return { ok: true };
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  simulateTransientError() {
    this.shouldFail = "transient";
  }

  simulatePermanentError() {
    this.shouldFail = "permanent";
  }

  clearErrors() {
    this.shouldFail = "none";
    this.failCount = 0;
  }

  getSent() {
    return this.sent;
  }

  reset() {
    this.sent = [];
    this.shouldFail = "none";
    this.failCount = 0;
    this.callCount = 0;
  }
}

// ---- Tests ---------------------------------------------------------------
async function testQueueAndFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue three sets offline
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 3,
    reps: 8,
    weightKg: 50,
    durationSeconds: null,
  });

  if (outbox.pendingCount() !== 3) {
    throw new Error(`Expected 3 pending, got ${outbox.pendingCount()}`);
  }

  // Flush: all three should be sent in order
  const result = await outbox.flush();
  if (result.sentClientIds.length !== 3 || result.stopped) {
    throw new Error(`Expected 3 sent, got ${result.sentClientIds.length}, stopped: ${result.stopped}`);
  }

  const sent = sender.getSent();
  if (sent.length !== 3) {
    throw new Error(`Expected 3 sent records, got ${sent.length}`);
  }
  if (sent[0].setNumber !== 1 || sent[1].setNumber !== 2 || sent[2].setNumber !== 3) {
    throw new Error("Sets sent out of order");
  }

  if (outbox.pendingCount() !== 0) {
    throw new Error(`Expected 0 pending after flush, got ${outbox.pendingCount()}`);
  }

  console.log("✓ Queue and flush: offline sets flushed in order");
}

async function testClientSideDedup() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue the same set twice (same exercise+setNumber)
  const id1 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  const id2 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1, // Same set number
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  // Should return the same clientId (deduplicated)
  if (id1 !== id2) {
    throw new Error("Client-side dedup failed: different clientIds returned");
  }

  // Only one set should be queued
  if (outbox.pendingCount() !== 1) {
    throw new Error(`Expected 1 pending (deduplicated), got ${outbox.pendingCount()}`);
  }

  await outbox.flush();
  if (sender.getSent().length !== 1) {
    throw new Error(`Expected 1 sent, got ${sender.getSent().length}`);
  }

  console.log("✓ Client-side dedup: same exercise+setNumber not queued twice");
}

async function testServerSideUpsert() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue and flush set 1
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  await outbox.flush();

  // Queue the same set again with different data (replay scenario)
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1, // Same set number
    reps: 12, // Different reps
    weightKg: 55, // Different weight
    durationSeconds: null,
  });
  await outbox.flush();

  const sent = sender.getSent();
  // Server upsert: only ONE row exists, but with the second set's data
  if (sent.length !== 1) {
    throw new Error(`Expected 1 row (upserted), got ${sent.length}`);
  }
  if (sent[0].reps !== 12 || sent[0].weightKg !== 55) {
    throw new Error(`Upsert failed: expected reps=12, weight=55, got reps=${sent[0].reps}, weight=${sent[0].weightKg}`);
  }

  console.log("✓ Server-side upsert: replay overwrites with new data");
}

async function testTransientError() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue three sets
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 3,
    reps: 8,
    weightKg: 50,
    durationSeconds: null,
  });

  // Simulate transient error (network timeout)
  sender.simulateTransientError();

  const result = await outbox.flush();
  if (result.sentClientIds.length !== 0 || !result.stopped) {
    throw new Error(`Expected 0 sent and stopped=true, got sent=${result.sentClientIds.length}, stopped=${result.stopped}`);
  }

  // All three should still be pending (first one has retries incremented)
  if (outbox.pendingCount() !== 3) {
    throw new Error(`Expected 3 still pending, got ${outbox.pendingCount()}`);
  }

  const pending = outbox.getPending();
  if (pending[0].retries !== 1) {
    throw new Error(`Expected retries=1 on first set, got ${pending[0].retries}`);
  }

  // Clear error and retry
  sender.clearErrors();
  const retry = await outbox.flush();
  if (retry.sentClientIds.length !== 3 || retry.stopped) {
    throw new Error(`Retry failed: sent=${retry.sentClientIds.length}, stopped=${retry.stopped}`);
  }

  if (outbox.pendingCount() !== 0) {
    throw new Error(`Expected 0 pending after retry, got ${outbox.pendingCount()}`);
  }

  console.log("✓ Transient error: sets kept in queue and retried");
}

async function testPermanentError() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue three sets
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 3,
    reps: 8,
    weightKg: 50,
    durationSeconds: null,
  });

  // Simulate permanent error (validation failure)
  sender.simulatePermanentError();

  const result = await outbox.flush();
  // All three fail permanently, so sent=0, but NOT stopped (we processed all)
  if (result.sentClientIds.length !== 0 || result.stopped) {
    throw new Error(`Expected 0 sent and stopped=false, got sent=${result.sentClientIds.length}, stopped=${result.stopped}`);
  }

  // None should be pending
  if (outbox.pendingCount() !== 0) {
    throw new Error(`Expected 0 pending, got ${outbox.pendingCount()}`);
  }

  // All three should be in failed list
  const failed = outbox.getFailed();
  if (failed.length !== 3) {
    throw new Error(`Expected 3 failed, got ${failed.length}`);
  }

  if (!failed[0].error.includes("Invalid")) {
    throw new Error("Failed error message missing");
  }

  // Clear one from failed list
  outbox.remove(failed[0].set.clientId);
  if (outbox.getFailed().length !== 2) {
    throw new Error("Failed to clear failed set");
  }

  console.log("✓ Permanent error: sets moved to failed list, not retried");
}

async function testOrderPreservation() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue five sets
  for (let i = 1; i <= 5; i++) {
    outbox.enqueue({
      sessionExerciseId: "ex1",
      setNumber: i,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    });
  }

  // Fail on the third set
  let callCount = 0;
  const originalSend = sender.send.bind(sender);
  sender.send = async (set) => {
    callCount++;
    if (callCount === 3) {
      return { ok: false, permanent: false, error: "Transient" };
    }
    return originalSend(set);
  };

  const result = await outbox.flush();
  if (result.sentClientIds.length !== 2 || !result.stopped) {
    throw new Error(`Expected 2 sent and stopped, got sent=${result.sentClientIds.length}, stopped=${result.stopped}`);
  }

  // Sets 1-2 sent, 3-5 still pending
  if (sender.getSent().length !== 2) {
    throw new Error(`Expected 2 sent, got ${sender.getSent().length}`);
  }
  if (outbox.pendingCount() !== 3) {
    throw new Error(`Expected 3 pending, got ${outbox.pendingCount()}`);
  }

  const pending = outbox.getPending();
  if (pending[0].setNumber !== 3 || pending[1].setNumber !== 4 || pending[2].setNumber !== 5) {
    throw new Error("Pending sets out of order");
  }

  console.log("✓ Order preservation: transient error stops flush, preserves order");
}

async function testConcurrentFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue three sets
  for (let i = 1; i <= 3; i++) {
    outbox.enqueue({
      sessionExerciseId: "ex1",
      setNumber: i,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    });
  }

  // Start two concurrent flushes
  const [result1, result2] = await Promise.all([outbox.flush(), outbox.flush()]);

  // Only one flush should have sent sets (the other returns early due to guard)
  const totalSent = result1.sentClientIds.length + result2.sentClientIds.length;
  if (totalSent !== 3) {
    throw new Error(`Expected 3 total sent, got ${totalSent}`);
  }

  // Each set should have been sent exactly once
  if (sender.callCount !== 3) {
    throw new Error(`Expected 3 send calls, got ${sender.callCount}`);
  }

  console.log("✓ Concurrent flush: guarded, each set sent once");
}

function testMergePendingSets() {
  type TestExercise = {
    id: string;
    sets: Array<{ setNumber: number; reps: number; pending?: boolean; clientId?: string }>;
  };

  const exercises: TestExercise[] = [
    { id: "ex1", sets: [{ setNumber: 1, reps: 10 }] },
    { id: "ex2", sets: [{ setNumber: 1, reps: 12 }, { setNumber: 2, reps: 11 }] },
    { id: "ex3", sets: [] },
  ];

  const pending: QueuedSet[] = [
    {
      clientId: "c1",
      sessionExerciseId: "ex1",
      setNumber: 2,
      reps: 9,
      weightKg: 50,
      durationSeconds: null,
      queuedAt: Date.now(),
      retries: 0,
    },
    {
      clientId: "c2",
      sessionExerciseId: "ex2",
      setNumber: 3,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      queuedAt: Date.now(),
      retries: 0,
    },
    {
      clientId: "c3",
      sessionExerciseId: "ex3",
      setNumber: 1,
      reps: 15,
      weightKg: null,
      durationSeconds: null,
      queuedAt: Date.now(),
      retries: 0,
    },
  ];

  const merged = mergePendingSets(exercises, pending);

  // ex1 should have sets 1 and 2
  if (merged[0].sets.length !== 2) {
    throw new Error(`ex1 expected 2 sets, got ${merged[0].sets.length}`);
  }
  if (merged[0].sets[1].setNumber !== 2 || !merged[0].sets[1].pending || merged[0].sets[1].clientId !== "c1") {
    throw new Error("ex1 set 2 not merged correctly or clientId missing");
  }

  // ex2 should have sets 1, 2, and 3
  if (merged[1].sets.length !== 3) {
    throw new Error(`ex2 expected 3 sets, got ${merged[1].sets.length}`);
  }
  if (merged[1].sets[2].setNumber !== 3 || !merged[1].sets[2].pending || merged[1].sets[2].clientId !== "c2") {
    throw new Error("ex2 set 3 not merged correctly or clientId missing");
  }

  // ex3 should have set 1
  if (merged[2].sets.length !== 1) {
    throw new Error(`ex3 expected 1 set, got ${merged[2].sets.length}`);
  }
  if (merged[2].sets[0].setNumber !== 1 || !merged[2].sets[0].pending || merged[2].sets[0].clientId !== "c3") {
    throw new Error("ex3 set 1 not merged correctly or clientId missing");
  }

  console.log("✓ mergePendingSets: pending sets merged with clientId carried");
}

async function testGenerateClientId() {
  // Test the UUID generation
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const id = Outbox.generateClientId();
    if (ids.has(id)) {
      throw new Error(`Duplicate client ID generated: ${id}`);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`Invalid UUID format: ${id}`);
    }
    ids.add(id);
  }
  console.log("✓ Generate client ID: 100 unique UUIDs");
}

async function testClassifyLogSetOutcome() {
  const { classifyLogSetOutcome } = await import("../src/lib/session/outbox");

  // Success
  const saved = classifyLogSetOutcome({ ok: true, data: {} });
  if (saved.outcome !== "saved") {
    throw new Error(`Expected 'saved', got '${saved.outcome}'`);
  }

  // Validation error (permanent)
  const invalid = classifyLogSetOutcome({ ok: false, error: "Invalid reps", data: { code: "invalid" } });
  if (invalid.outcome !== "invalid" || invalid.error !== "Invalid reps") {
    throw new Error(`Expected 'invalid' with error, got '${invalid.outcome}'`);
  }

  // Server error (transient)
  const queue = classifyLogSetOutcome({ ok: false, error: "Database timeout", data: {} });
  if (queue.outcome !== "queue" || queue.error !== "Database timeout") {
    throw new Error(`Expected 'queue' with error, got '${queue.outcome}'`);
  }

  // Thrown error (network failure)
  const thrown = classifyLogSetOutcome({ thrown: new Error("Network unreachable") });
  if (thrown.outcome !== "queue" || thrown.error !== "Network unreachable") {
    throw new Error(`Expected 'queue' for thrown error, got '${thrown.outcome}'`);
  }

  // Thrown non-Error
  const thrownString = classifyLogSetOutcome({ thrown: "Fetch failed" });
  if (thrownString.outcome !== "queue" || thrownString.error !== "Network error") {
    throw new Error(`Expected 'queue' with generic error for non-Error throw, got '${thrownString.outcome}'`);
  }

  console.log("✓ classifyLogSetOutcome: correctly classifies success, invalid, transient, and thrown errors");
}

async function testPartialFlushClearing() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue two sets
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });

  // Capture clientIds for verification
  const state = storage.get();
  if (!state || state.pending.length !== 2) {
    throw new Error("Expected 2 pending sets");
  }
  const firstClientId = state.pending[0].clientId;
  const secondClientId = state.pending[1].clientId;

  // Make sender fail on the second call only
  let callCount = 0;
  const selectiveSender = new Proxy(sender, {
    get(target, prop) {
      if (prop === "send") {
        return async (...args: unknown[]) => {
          callCount++;
          if (callCount === 2) {
            // Fail the second send
            return { ok: false, permanent: false, error: "Network timeout" };
          }
          return (target as FakeSender).send(...(args as Parameters<FakeSender["send"]>));
        };
      }
      return (target as FakeSender)[prop as keyof FakeSender];
    },
  });

  const selectiveOutbox = new Outbox(storage, selectiveSender as OutboxSender, "test-outbox");
  const result = await selectiveOutbox.flush();

  // First set should be sent, second should still be pending
  if (result.sentClientIds.length !== 1 || !result.stopped) {
    throw new Error(`Expected 1 sent and stopped=true, got ${result.sentClientIds.length} sent, stopped=${result.stopped}`);
  }

  if (result.sentClientIds[0] !== firstClientId) {
    throw new Error("First clientId should be in sentClientIds");
  }

  // Only the second set should still be pending
  if (selectiveOutbox.pendingCount() !== 1) {
    throw new Error(`Expected 1 pending after partial flush, got ${selectiveOutbox.pendingCount()}`);
  }

  // Verify the UI would only clear the first set's pending flag
  const stateAfter = storage.get();
  if (!stateAfter || stateAfter.pending.length !== 1) {
    throw new Error("Expected 1 pending set in storage");
  }
  if (stateAfter.pending[0].clientId !== secondClientId) {
    throw new Error("Second set should still be pending");
  }

  console.log("✓ Partial flush clearing: only matching clientIds cleared");
}

async function testConcurrentFlushSkipped() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue a set
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  // Add a delay to sender so flush takes time
  const slowSender = new Proxy(sender, {
    get(target, prop) {
      if (prop === "send") {
        return async (...args: unknown[]) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (target as FakeSender).send(...(args as Parameters<FakeSender["send"]>));
        };
      }
      return (target as FakeSender)[prop as keyof FakeSender];
    },
  });

  const slowOutbox = new Outbox(storage, slowSender as OutboxSender, "test-outbox");

  // Start first flush (doesn't await)
  const firstFlush = slowOutbox.flush();

  // Second flush should return immediately with skipped=true
  const secondResult = await slowOutbox.flush();
  if (!secondResult.skipped || secondResult.sentClientIds.length !== 0) {
    throw new Error(`Expected skipped=true and 0 sent, got skipped=${secondResult.skipped}, sent=${secondResult.sentClientIds.length}`);
  }

  // Wait for first flush to complete
  const firstResult = await firstFlush;
  if (firstResult.skipped || firstResult.sentClientIds.length !== 1) {
    throw new Error(`First flush should succeed with 1 sent, got skipped=${firstResult.skipped}, sent=${firstResult.sentClientIds.length}`);
  }

  console.log("✓ Concurrent flush skipped: in-flight lock returns skipped=true");
}

async function testRemoveMethod() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test-outbox");

  // Queue two sets
  const clientId1 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });
  const clientId2 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });

  if (outbox.pendingCount() !== 2) {
    throw new Error(`Expected 2 pending, got ${outbox.pendingCount()}`);
  }

  // Remove first set (undo)
  outbox.remove(clientId1);

  if (outbox.pendingCount() !== 1) {
    throw new Error(`Expected 1 pending after remove, got ${outbox.pendingCount()}`);
  }

  // Remaining set should be the second one
  const pending = outbox.getPending();
  if (pending.length !== 1 || pending[0].clientId !== clientId2) {
    throw new Error("Wrong set remained after remove");
  }

  // Clear the remaining set to test failed list removal
  outbox.remove(clientId2);
  if (outbox.pendingCount() !== 0) {
    throw new Error("Expected 0 pending after clearing");
  }

  // Test removing from failed list too
  const clientId3 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 3,
    reps: 8,
    weightKg: 50,
    durationSeconds: null,
  });

  // Make it fail permanently
  sender.simulatePermanentError();
  await outbox.flush();
  sender.clearErrors();

  if (outbox.getFailed().length !== 1) {
    throw new Error(`Expected 1 failed set, got ${outbox.getFailed().length}`);
  }

  // Remove the failed set
  outbox.remove(clientId3);

  if (outbox.getFailed().length !== 0) {
    throw new Error(`Expected 0 failed after remove, got ${outbox.getFailed().length}`);
  }

  console.log("✓ Remove method: removes from both pending and failed lists");
}

async function testEnqueueDuringFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();

  // Queue a set using normal sender
  const normalOutbox = new Outbox(storage, sender, "test-outbox");
  normalOutbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  // Get the initial state to capture the first set's clientId
  const initialState = storage.get();
  if (!initialState || initialState.pending.length !== 1) {
    throw new Error("Expected 1 pending set initially");
  }
  const firstClientId = initialState.pending[0].clientId;

  // Create a slow sender that delays during send
  let sendStarted = false;
  const slowSender = new Proxy(sender, {
    get(target, prop) {
      if (prop === "send") {
        return async (...args: unknown[]) => {
          sendStarted = true;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (target as FakeSender).send(...(args as Parameters<FakeSender["send"]>));
        };
      }
      return (target as FakeSender)[prop as keyof FakeSender];
    },
  });

  // Use slow sender outbox for flush
  const slowOutbox = new Outbox(storage, slowSender as OutboxSender, "test-outbox");

  // Start flush (doesn't await)
  const flushPromise = slowOutbox.flush();

  // Wait for send to start
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (sendStarted) {
        clearInterval(interval);
        resolve(null);
      }
    }, 5);
  });

  // Enqueue a new set while flush is running
  const secondClientId = normalOutbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 9,
    weightKg: 50,
    durationSeconds: null,
  });

  // Verify it was enqueued
  const midFlushState = storage.get();
  if (!midFlushState || midFlushState.pending.length !== 2) {
    throw new Error(`Expected 2 pending during flush, got ${midFlushState?.pending.length ?? 0}`);
  }

  // Wait for flush to complete
  const result = await flushPromise;

  // First set should be sent
  if (!result.sentClientIds.includes(firstClientId)) {
    throw new Error(`Expected first clientId in sentClientIds, got ${result.sentClientIds}`);
  }

  // Second set should NOT be sent (it was queued during flush)
  if (result.sentClientIds.includes(secondClientId)) {
    throw new Error(`Second clientId should NOT be in sentClientIds, but it is: ${result.sentClientIds}`);
  }

  // Second set should still be pending (not wiped by flush)
  const finalState = storage.get();
  if (!finalState || finalState.pending.length !== 1) {
    throw new Error(`Expected 1 pending after flush, got ${finalState?.pending.length ?? 0}. Sent: ${result.sentClientIds}`);
  }
  if (finalState.pending[0].clientId !== secondClientId) {
    throw new Error("Enqueued set during flush was lost!");
  }

  console.log("✓ Enqueue during flush: new set survives concurrent enqueue");
}

// ---- Network Error Detection ---------------------------------------------
async function testNetworkErrorDetection() {
  const { isNetworkError } = await import("../src/lib/session/network-error");

  // TypeError with "Failed to fetch" message (network error)
  const typeError = new TypeError("Failed to fetch");
  if (!isNetworkError(typeError)) {
    throw new Error("TypeError('Failed to fetch') should be detected as network error");
  }

  // Plain TypeError (coding bug) should NOT be network error
  const codingBug = new TypeError("x.map is not a function");
  if (isNetworkError(codingBug)) {
    throw new Error("TypeError('x.map is not a function') should NOT be network error");
  }

  // Error with "Failed to fetch" message
  const fetchError = new Error("Failed to fetch");
  if (!isNetworkError(fetchError)) {
    throw new Error("'Failed to fetch' message should be detected as network error");
  }

  // Error with "network request failed" message
  const networkError = new Error("Network request failed");
  if (!isNetworkError(networkError)) {
    throw new Error("'Network request failed' message should be detected as network error");
  }

  // Error with "NetworkError" message
  const networkError2 = new Error("NetworkError when attempting to fetch resource");
  if (!isNetworkError(networkError2)) {
    throw new Error("'NetworkError' message should be detected as network error");
  }

  // Error with "load failed" message
  const loadError = new Error("Load failed");
  if (!isNetworkError(loadError)) {
    throw new Error("'Load failed' message should be detected as network error");
  }

  // Validation error should NOT be detected as network error
  const validationError = new Error("Invalid set data");
  if (isNetworkError(validationError)) {
    throw new Error("Validation error should NOT be detected as network error");
  }

  // Generic error should NOT be detected as network error
  const genericError = new Error("Something went wrong");
  if (isNetworkError(genericError)) {
    throw new Error("Generic error should NOT be detected as network error");
  }

  // Non-Error object should NOT be detected as network error
  const stringError = "Some error string";
  if (isNetworkError(stringError)) {
    throw new Error("String error should NOT be detected as network error");
  }

  console.log("✓ Network error detection: TypeError('Failed to fetch') detected");
  console.log("✓ Network error detection: TypeError('x.map...') excluded (coding bug)");
  console.log("✓ Network error detection: 'Failed to fetch' message detected");
  console.log("✓ Network error detection: 'network request failed' message detected");
  console.log("✓ Network error detection: 'NetworkError' message detected");
  console.log("✓ Network error detection: 'load failed' message detected");
  console.log("✓ Network error detection: validation errors excluded");
  console.log("✓ Network error detection: generic errors excluded");
}

// ---- M1: Set Removed During Flush ----------------------------------------
async function testSetRemovedDuringFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test");

  // Enqueue two sets
  const clientId1 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    durationSeconds: null,
  });
  
  const clientId2 = outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 100,
    durationSeconds: null,
  });

  // Make sender slow
  sender.setDelay(50);

  // Start flush (doesn't await)
  const flushPromise = outbox.flush();

  // Remove second set while flush is in progress
  await new Promise((resolve) => setTimeout(resolve, 10));
  outbox.remove(clientId2);

  // Wait for flush to complete
  const result = await flushPromise;

  // Only first set should be sent
  if (sender.sent.length !== 1) {
    throw new Error(`Expected 1 sent, got ${sender.sent.length}`);
  }
  
  if (!result.sentClientIds.includes(clientId1)) {
    throw new Error("First set should be sent");
  }
  
  if (result.sentClientIds.includes(clientId2)) {
    throw new Error("Second set should NOT be sent (was removed)");
  }

  console.log("✓ M1: Set removed during flush isn't sent");
}

// ---- M2: Set Goes to Failed After 10 Retries ----------------------------
async function testMaxRetries() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test");

  // Enqueue a set
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    durationSeconds: null,
  });

  // Make sender fail transiently
  sender.simulateTransientError();

  // Flush 10 times (should increment retries to 10)
  for (let i = 0; i < 10; i++) {
    await outbox.flush();
  }

  // Set should still be pending (retries = 10)
  let state = storage.get();
  if (!state || state.pending.length !== 1) {
    throw new Error("Set should still be pending after 10 flushes");
  }
  
  if (state.pending[0].retries !== 10) {
    throw new Error(`Expected retries=10, got ${state.pending[0].retries}`);
  }

  // One more flush should move it to failed (retries >= 10)
  await outbox.flush();

  state = storage.get();
  if (!state || state.pending.length !== 0) {
    throw new Error("Set should be removed from pending");
  }
  
  if (state.failed.length !== 1) {
    throw new Error(`Expected 1 failed set, got ${state.failed.length}`);
  }
  
  if (!state.failed[0].error.includes("10 retries")) {
    throw new Error(`Expected '10 retries' in error, got: ${state.failed[0].error}`);
  }

  console.log("✓ M2: Set goes to failed after 10 retries");
}

// ---- M4: nextSetNumberFor Handles Gaps -----------------------------------
function testNextSetNumberWithGaps() {
  const { nextSetNumberFor } = require("../src/lib/session/outbox");

  // Empty array
  if (nextSetNumberFor([]) !== 1) {
    throw new Error("Empty array should return 1");
  }

  // Contiguous sets
  if (nextSetNumberFor([{ setNumber: 1 }, { setNumber: 2 }]) !== 3) {
    throw new Error("Contiguous [1,2] should return 3");
  }

  // Gap: [1, 3] should return 4 (max + 1, not 2)
  if (nextSetNumberFor([{ setNumber: 1 }, { setNumber: 3 }]) !== 4) {
    throw new Error("[1,3] should return 4");
  }

  // Out of order: [3, 1, 2] should return 4
  if (
    nextSetNumberFor([
      { setNumber: 3 },
      { setNumber: 1 },
      { setNumber: 2 },
    ]) !== 4
  ) {
    throw new Error("[3,1,2] should return 4");
  }

  console.log("✓ M4: nextSetNumberFor([1,3]) === 4");
}

// ---- M6: isFlushing() During Flush ---------------------------------------
async function testIsFlushingDuringFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender, "test");

  // Enqueue a set
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 100,
    durationSeconds: null,
  });

  // Make sender slow
  sender.setDelay(50);

  // isFlushing should be false before flush
  if (outbox.isFlushing()) {
    throw new Error("isFlushing should be false before flush");
  }

  // Start flush
  const flushPromise = outbox.flush();

  // isFlushing should be true during flush
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (!outbox.isFlushing()) {
    throw new Error("isFlushing should be true during flush");
  }

  // Wait for flush to complete
  await flushPromise;

  // isFlushing should be false after flush
  if (outbox.isFlushing()) {
    throw new Error("isFlushing should be false after flush");
  }

  console.log("✓ M6: isFlushing() is true during flush");
}

// ---- M8: Postgres Error Classification -----------------------------------
function testPostgresErrorClassification() {
  const { isPostgresPermanentError } = require("../src/lib/session/outbox");

  // 22P02: Data exception (invalid text representation)
  if (!isPostgresPermanentError("22P02")) {
    throw new Error("22P02 should be permanent");
  }

  // 23505: Unique violation
  if (!isPostgresPermanentError("23505")) {
    throw new Error("23505 should be permanent");
  }

  // 42501: Insufficient privilege
  if (!isPostgresPermanentError("42501")) {
    throw new Error("42501 should be permanent");
  }

  // 53300: Too many connections (transient)
  if (isPostgresPermanentError("53300")) {
    throw new Error("53300 should be transient");
  }

  // Null/undefined
  if (isPostgresPermanentError(null)) {
    throw new Error("null should be transient");
  }
  
  if (isPostgresPermanentError(undefined)) {
    throw new Error("undefined should be transient");
  }

  console.log("✓ M8: Postgres 22P02, 23505, 42501 classify as invalid");
}

// ---- Main ----------------------------------------------------------------
async function main() {
  console.log("Testing offline-safe set logging...\n");

  await testQueueAndFlush();
  await testClientSideDedup();
  await testServerSideUpsert();
  await testTransientError();
  await testPermanentError();
  await testOrderPreservation();
  await testConcurrentFlush();
  testMergePendingSets();
  await testGenerateClientId();
  await testClassifyLogSetOutcome();
  await testPartialFlushClearing();
  await testConcurrentFlushSkipped();
  await testRemoveMethod();
  await testEnqueueDuringFlush();
  await testNetworkErrorDetection();
  await testSetRemovedDuringFlush();
  await testMaxRetries();
  testNextSetNumberWithGaps();
  await testIsFlushingDuringFlush();
  testPostgresErrorClassification();

  console.log("\n✓ All offline set logging tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
