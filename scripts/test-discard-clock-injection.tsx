/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay uses injected clock in Discard handler.
 * Renders the REAL PendingSetReplay component and tests clock-dependent behavior.
 * 
 * Mutant: not passing clock to createPendingSetDeps in handleDiscard must fail this test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { render, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";
import { PendingSetReplay } from "../src/components/pending-set-replay";

describe("PendingSetReplay clock injection", () => {
  it("uses injected clock in Discard handler", async () => {
    const mockNow = new Date("2026-01-15T12:00:00Z");
    const userId = "user1";
    const sessionId = "session1";
    
    // Create a mock storage
    const storage = {
      data: new Map<string, string>(),
      getItem(key: string) { return this.data.get(key) ?? null; },
      setItem(key: string, value: string) { this.data.set(key, value); },
      removeItem(key: string) { this.data.delete(key); },
      clear() { this.data.clear(); },
      get length() { return this.data.size; },
      key(index: number) { return Array.from(this.data.keys())[index] ?? null; },
    };
    
    // Plant a set that's 8 days old (expired)
    const eightDaysAgo = mockNow.getTime() - 8 * 24 * 60 * 60 * 1000;
    storage.setItem(
      `pending-sets:${userId}`,
      JSON.stringify({
        [sessionId]: {
          sets: [
            {
              clientId: "set1",
              sessionExerciseId: "ex1",
              setNumber: 1,
              reps: 10,
              weightKg: 50,
              durationSeconds: null,
            },
          ],
          timestamp: eightDaysAgo,
        },
      })
    );

    const mockGetSessionStatus = async () => "ended" as const;
    const mockLogSet = async () => ({ ok: false, error: "Session closed" } as const);

    const { findByText, findByRole } = render(
      <PendingSetReplay
        userId={userId}
        storage={storage}
        getSessionStatus={mockGetSessionStatus}
        logSet={mockLogSet}
        now={mockNow}
      />
    );

    // Wait for the component to show the "couldn't be saved" message
    await waitFor(async () => {
      const message = await findByText(/couldn't be saved/i);
      assert.ok(message, "Should show 'couldn't be saved' message");
    });

    // Find and click the Discard button
    const discardButton = await findByRole("button", { name: /discard/i });
    const user = userEvent.setup();
    await user.click(discardButton);

    // Verify the set was cleared from storage
    // The clock-dependent behavior: if clock wasn't passed, the timestamp check might fail
    await waitFor(() => {
      const stored = storage.getItem(`pending-sets:${userId}`);
      assert.strictEqual(
        stored, 
        null, 
        "Sets should be cleared after Discard (mutant: not passing clock to createPendingSetDeps must fail this)"
      );
    });
  });
});
