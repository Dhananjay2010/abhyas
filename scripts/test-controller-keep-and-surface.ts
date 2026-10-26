/**
 * test-controller-keep-and-surface.ts
 * Verify that controller.load() and controller.replay() keep sets instead of deleting
 * when session is not in progress (keep-and-surface policy).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPendingSetController } from "../src/lib/session/pending-set-controller";
import type { PendingSet } from "../src/lib/session/pending-set-storage";

describe("Controller keep-and-surface", () => {
  it("load() keeps sets when session is not in progress", async () => {
    const mockStorage = new Map<string, string>();
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    const userId = "user1";
    const sessionId = "session1";

    const set: PendingSet = {
      clientId: "set1",
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    };

    // Plant a pending set
    mockStorage.set(
      `pending-sets:${userId}`,
      JSON.stringify({
        [sessionId]: {
          sets: [set],
          timestamp: mockNow(),
        },
      })
    );

    const mockLogSet = async () => ({ ok: false, error: "Session closed" } as const);
    const mockSessionStatus = "closed" as const;

    const controller = createPendingSetController({
      userId,
      sessionId,
      storage: mockStorage as unknown as Storage,
      logSet: mockLogSet,
      sessionStatus: mockSessionStatus,
      now: mockNow,
    });

    controller.load();

    const state = controller.getState();

    // Verify sets are still in storage (not deleted)
    const stored = mockStorage.get(`pending-sets:${userId}`);
    assert.ok(stored, "Sets should remain in storage");

    // Verify state shows pending sets
    assert.strictEqual(state.pending.length, 1, "State should show pending sets");
  });

  it("replay() keeps sets when session is not in progress", async () => {
    const mockStorage = new Map<string, string>();
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    const userId = "user1";
    const sessionId = "session1";

    const set: PendingSet = {
      clientId: "set1",
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    };

    mockStorage.set(
      `pending-sets:${userId}`,
      JSON.stringify({
        [sessionId]: {
          sets: [set],
          timestamp: mockNow(),
        },
      })
    );

    const mockLogSet = async () => ({ ok: false, error: "Session closed" } as const);
    const mockSessionStatus = "closed" as const;

    const controller = createPendingSetController({
      userId,
      sessionId,
      storage: mockStorage as unknown as Storage,
      logSet: mockLogSet,
      sessionStatus: mockSessionStatus,
      now: mockNow,
    });

    await controller.replay();

    // Verify sets are still in storage (not deleted)
    const stored = mockStorage.get(`pending-sets:${userId}`);
    assert.ok(stored, "Sets should remain in storage after replay");

    const state = controller.getState();
    assert.strictEqual(state.pending.length, 1, "State should show pending sets after replay");
    assert.ok(state.error, "State should show error for non-in-progress session");
  });
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  describe("test suite", async () => {
    await import("node:test").then((t) => t.run());
  });
}
