/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay uses injected clock prop.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

describe("PendingSetReplay clock injection", () => {
  it("createPendingSetDeps accepts a Date and uses it", () => {
    const mockNow = new Date("2026-01-15T12:00:00Z");
    const deps = createPendingSetDeps(mockNow);
    
    // Verify the clock function returns the expected time
    assert.strictEqual(deps.now(), mockNow.getTime(), "now() should return injected time");
  });

  it("createPendingSetDeps accepts a function and uses it", () => {
    const mockNow = () => Date.parse("2026-01-15T12:00:00Z");
    const deps = createPendingSetDeps(mockNow);
    
    // Verify the clock function returns the expected time
    assert.strictEqual(deps.now(), Date.parse("2026-01-15T12:00:00Z"), "now() should use injected function");
  });
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  describe("test suite", async () => {
    await import("node:test").then((t) => t.run());
  });
}
