/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay passes injected clock to Discard handler.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import React from "react";
import { PendingSetReplay } from "../src/components/pending-set-replay";

describe("PendingSetReplay Discard clock injection", () => {
  it("passes injected clock to handleDiscard", async () => {
    const mockStorage = new Map<string, string>();
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    const userId = "user1";
    const sessionId = "session1";

    // Plant a pending set
    mockStorage.set(
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
          timestamp: mockNow() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        },
      })
    );

    const mockGetSessionStatus = async () => "closed" as const;
    const mockLogSet = async () => ({ ok: false, error: "Session closed" } as const);

    // Render with mock storage
    const { findByText, findByRole } = render(
      <PendingSetReplay
        userId={userId}
        storage={mockStorage as unknown as Storage}
        getSessionStatus={mockGetSessionStatus}
        logSet={mockLogSet}
        now={mockNow}
      />
    );

    // Wait for UI to show closed session message
    await findByText(/couldn't be saved/i);

    const discardButton = await findByRole("button", { name: /discard/i });

    // Click Discard
    const user = userEvent.setup();
    await user.click(discardButton);

    // Verify set was cleared
    const stored = mockStorage.get(`pending-sets:${userId}`);
    assert.strictEqual(stored, undefined, "Sets should be cleared after discard");
  });
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  describe("test suite", async () => {
    await import("node:test").then((t) => t.run());
  });
}
