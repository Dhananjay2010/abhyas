#!/usr/bin/env tsx
/**
 * Test offline-safe set logging: outbox queuing, idempotency, and deduplication.
 *
 * Verifies:
 * 1. Sets queued offline are persisted and flushed on reconnect
 * 2. Replays send the same client_id, and the server deduplicates
 * 3. Permanent errors (validation) are moved to failed list
 * 4. Transient errors (network) keep sets in queue
 * 5. Without client_id, duplicate sets can be inserted (guard case)
 */

import { Outbox, type OutboxStorage, type OutboxSender, type QueuedSet, type SendResult } from "../src/lib/session/outbox";

// ---- Fake storage --------------------------------------------------------
class FakeStorage implements OutboxStorage {
  private state: ReturnType<OutboxStorage["get"]> = null;

  get() {
    return this.state;
  }

  set(state: ReturnType<OutboxStorage["get"]>) {
    this.state = state;
  }

  clear() {
    this.state = null;
  }
}

// ---- Fake sender ---------------------------------------------------------
type SentSet = QueuedSet & { sentAt: number };

class FakeSender implements OutboxSender {
  sent: SentSet[] = [];
  private shouldFail: "none" | "transient" | "permanent" = "none";
  private failCount = 0;

  async send(set: QueuedSet): Promise<SendResult> {
    if (this.shouldFail === "transient") {
      this.failCount++;
      return { ok: false, permanent: false, error: "Network timeout" };
    }
    if (this.shouldFail === "permanent") {
      this.failCount++;
      return { ok: false, permanent: true, error: "Invalid reps: must be positive" };
    }

    // Check for duplicate client_id (server-side deduplication)
    const duplicate = this.sent.find((s) => s.clientId === set.clientId);
    if (duplicate) {
      // Idempotency: already inserted, return success
      return { ok: true };
    }

    this.sent.push({ ...set, sentAt: Date.now() });
    return { ok: true };
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
  }
}

// ---- Tests ---------------------------------------------------------------
async function testQueueAndFlush() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender);

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
  if (result.sent !== 3 || result.stopped) {
    throw new Error(`Expected 3 sent, got ${result.sent}, stopped: ${result.stopped}`);
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

async function testIdempotency() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender);

  // Queue one set
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  // Flush once
  await outbox.flush();
  if (sender.getSent().length !== 1) {
    throw new Error("First flush failed");
  }

  // Queue the SAME set again (simulating a duplicate flush or retry)
  const pending = outbox.getPending();
  if (pending.length > 0) {
    throw new Error("Queue should be empty after flush");
  }

  // Manually re-queue using the same client_id (simulating a race or bug)
  const firstClientId = sender.getSent()[0].clientId;
  storage.set({
    pending: [
      {
        clientId: firstClientId, // Same ID
        sessionExerciseId: "ex1",
        setNumber: 1,
        reps: 10,
        weightKg: 50,
        durationSeconds: null,
        queuedAt: Date.now(),
        retries: 0,
      },
    ],
    failed: [],
  });

  // Flush again: sender should recognize duplicate and return success
  const result = await outbox.flush();
  if (result.sent !== 1) {
    throw new Error(`Expected 1 sent (deduplicated), got ${result.sent}`);
  }

  // Still only ONE set in the sent records (not two)
  if (sender.getSent().length !== 1) {
    throw new Error(`Expected 1 unique set, got ${sender.getSent().length}`);
  }

  console.log("✓ Idempotency: duplicate client_id deduplicated by server");
}

async function testTransientError() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender);

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
  if (result.sent !== 0 || !result.stopped) {
    throw new Error(`Expected 0 sent and stopped=true, got sent=${result.sent}, stopped=${result.stopped}`);
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
  if (retry.sent !== 3 || retry.stopped) {
    throw new Error(`Retry failed: sent=${retry.sent}, stopped=${retry.stopped}`);
  }

  if (outbox.pendingCount() !== 0) {
    throw new Error(`Expected 0 pending after retry, got ${outbox.pendingCount()}`);
  }

  console.log("✓ Transient error: sets kept in queue and retried");
}

async function testPermanentError() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender);

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
  if (result.sent !== 0 || result.stopped) {
    throw new Error(`Expected 0 sent and stopped=false, got sent=${result.sent}, stopped=${result.stopped}`);
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
  outbox.clearFailed(failed[0].set.clientId);
  if (outbox.getFailed().length !== 2) {
    throw new Error("Failed to clear failed set");
  }

  console.log("✓ Permanent error: sets moved to failed list, not retried");
}

async function testOrderPreservation() {
  const storage = new FakeStorage();
  const sender = new FakeSender();
  const outbox = new Outbox(storage, sender);

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
  sender.send = async (set: QueuedSet) => {
    callCount++;
    if (callCount === 3) {
      return { ok: false, permanent: false, error: "Transient" };
    }
    return originalSend(set);
  };

  const result = await outbox.flush();
  if (result.sent !== 2 || !result.stopped) {
    throw new Error(`Expected 2 sent and stopped, got sent=${result.sent}, stopped=${result.stopped}`);
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

async function testWithoutIdempotencyKey() {
  // Guard case: without client_id, the server can insert duplicates.
  // This test proves the problem the idempotency key solves.

  const storage = new FakeStorage();
  const sent: Array<{ setNumber: number; clientId?: string }> = [];

  const sender: OutboxSender = {
    async send(set) {
      // Simulate a server that does NOT check client_id
      sent.push({ setNumber: set.setNumber });
      return { ok: true };
    },
  };

  const outbox = new Outbox(storage, sender);

  // Queue one set
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  // Flush once
  await outbox.flush();
  if (sent.length !== 1) {
    throw new Error("First flush failed");
  }

  // Without the idempotency check, re-queuing and flushing would insert again
  // (This is the BAD behavior we're preventing)
  outbox.enqueue({
    sessionExerciseId: "ex1",
    setNumber: 1, // SAME set number
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  await outbox.flush();
  // Without server-side deduplication, this would be 2
  if (sent.length !== 2) {
    throw new Error("Without idempotency key, duplicate was not prevented (expected)");
  }

  console.log("✓ Guard case: without client_id, duplicates CAN be inserted");
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

// ---- Main ----------------------------------------------------------------
async function main() {
  console.log("Testing offline-safe set logging...\n");

  await testQueueAndFlush();
  await testIdempotency();
  await testTransientError();
  await testPermanentError();
  await testOrderPreservation();
  await testWithoutIdempotencyKey();
  await testGenerateClientId();

  console.log("\n✓ All offline set logging tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
