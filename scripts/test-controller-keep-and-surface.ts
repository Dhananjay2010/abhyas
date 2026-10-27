/**
 * test-controller-keep-and-surface.ts
 * Verify that controller.load() and controller.replay() keep sets instead of deleting
 * when session is not in progress (keep-and-surface policy).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPendingSetController } from "../src/lib/session/pending-set-controller";
import type { PendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

describe("Controller keep-and-surface", () => {
  it("load() keeps sets when session is not in progress", async () => {
    const mockStorage: Storage = {
      data: new Map<string, string>(),
      getItem(key): string | null { return this.data.get(key) ?? null; },
      setItem(key, value): void { this.data.set(key, value); },
      removeItem(key): void { this.data.delete(key); },
      clear(): void { this.data.clear(); },
      get length(): number { return this.data.size; },
      key(index): string | null { 
        const keys: string[] = Array.from(this.data.keys()); 
        return index >= 0 && index < keys.length ? keys[index] : null; 
      },
    };
    
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
    mockStorage.setItem(
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
      storage: mockStorage,
      logSet: mockLogSet,
      sessionStatus: mockSessionStatus,
      deps: createPendingSetDeps(mockNow),
      onChange: () => {},
    });

    controller.load();

    const state = controller.getState();

    // Verify sets are still in storage (not deleted)
    const stored = mockStorage.getItem(`pending-sets:${userId}`);
    assert.ok(stored, "Sets should remain in storage");

    // Verify state shows pending sets
    assert.strictEqual(state.pending.length, 1, "State should show pending sets");
  });

  it("replay() keeps sets when session is not in progress", async () => {
    const mockStorage: Storage = {
      data: new Map<string, string>(),
      getItem(key): string | null { return this.data.get(key) ?? null; },
      setItem(key, value): void { this.data.set(key, value); },
      removeItem(key): void { this.data.delete(key); },
      clear(): void { this.data.clear(); },
      get length(): number { return this.data.size; },
      key(index): string | null { 
        const keys: string[] = Array.from(this.data.keys()); 
        return index >= 0 && index < keys.length ? keys[index] : null; 
      },
    };
    
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

    mockStorage.setItem(
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
      storage: mockStorage,
      logSet: mockLogSet,
      sessionStatus: mockSessionStatus,
      deps: createPendingSetDeps(mockNow),
      onChange: () => {},
    });

    await controller.replay();

    // Verify sets are still in storage (not deleted)
    const stored = mockStorage.getItem(`pending-sets:${userId}`);
    assert.ok(stored, "Sets should remain in storage after replay");

    const state = controller.getState();
    assert.strictEqual(state.pending.length, 1, "State should show pending sets after replay");
    assert.ok(state.error, "State should show error for non-in-progress session");
  });
});
