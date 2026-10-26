/**
 * test-seven-day-no-logset.ts
 * Verify that sets older than 7 days are NOT sent to logSet.
 * They are kept in storage and surfaced to the user.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attemptPendingSet } from "../src/lib/session/pending-set-outcome";
import type { PendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

describe("7-day cutoff - no logSet call", () => {
  it("sets >7 days old are NOT sent to logSet", async () => {
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    let logSetCalled = false;

    const mockStorage = new Map<string, string>();
    const userId = "user1";
    const sessionId = "session1";

    const set: PendingSet = {
      clientId: "old-set",
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    };

    const timestamp = mockNow() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

    // Plant the old set
    mockStorage.set(
      `pending-sets:${userId}`,
      JSON.stringify({
        [sessionId]: {
          sets: [set],
          timestamp,
        },
      })
    );

    const mockLogSet = async () => {
      logSetCalled = true;
      return { ok: true } as const;
    };

    const outcome = await attemptPendingSet({
      set,
      userId,
      sessionId,
      storage: mockStorage as unknown as Storage,
      deps: createPendingSetDeps(mockNow),
      logSet: mockLogSet,
      sessionStatus: "in-progress",
    });

    // Verify logSet was NOT called
    assert.strictEqual(logSetCalled, false, "logSet should NOT be called for >7 day sets");

    // Verify outcome is "closed" (will be surfaced)
    assert.strictEqual(outcome.status, "closed", "Outcome should be 'closed' for old sets");

    // Verify set is still in storage (kept for surfacing)
    const stored = mockStorage.get(`pending-sets:${userId}`);
    assert.ok(stored, "Set should remain in storage");
  });

  it("sets <=7 days old ARE sent to logSet", async () => {
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    let logSetCalled = false;

    const mockStorage = new Map<string, string>();
    const userId = "user1";
    const sessionId = "session1";

    const set: PendingSet = {
      clientId: "recent-set",
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    };

    const timestamp = mockNow() - 5 * 24 * 60 * 60 * 1000; // 5 days ago

    mockStorage.set(
      `pending-sets:${userId}`,
      JSON.stringify({
        [sessionId]: {
          sets: [set],
          timestamp,
        },
      })
    );

    const mockLogSet = async () => {
      logSetCalled = true;
      return { ok: true } as const;
    };

    const outcome = await attemptPendingSet({
      set,
      userId,
      sessionId,
      storage: mockStorage as unknown as Storage,
      deps: createPendingSetDeps(mockNow),
      logSet: mockLogSet,
      sessionStatus: "in-progress",
    });

    // Verify logSet WAS called
    assert.strictEqual(logSetCalled, true, "logSet should be called for <=7 day sets");

    // Verify outcome is "saved"
    assert.strictEqual(outcome.status, "saved", "Outcome should be 'saved' for recent sets");
  });
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  describe("test suite", async () => {
    await import("node:test").then((t) => t.run());
  });
}
