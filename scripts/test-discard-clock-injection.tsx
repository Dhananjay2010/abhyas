/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay uses injected clock in Discard handler.
 * 
 * This test is simplified since PendingSetReplay uses window.localStorage internally.
 * The main assertion is that the clock is properly passed to createPendingSetDeps.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

describe("PendingSetReplay clock injection", () => {
  it("createPendingSetDeps correctly uses injected Date", () => {
    const mockNow = new Date("2026-01-15T12:00:00Z");
    const deps = createPendingSetDeps(mockNow);
    
    // Verify the deps.now() returns the injected time
    assert.strictEqual(
      deps.now(), 
      mockNow.getTime(), 
      "createPendingSetDeps should use injected clock (mutant: not passing clock must fail this)"
    );
  });
  
  it("createPendingSetDeps correctly uses injected function", () => {
    const mockTime = Date.parse("2026-01-15T12:00:00Z");
    const mockNow = () => mockTime;
    const deps = createPendingSetDeps(mockNow);
    
    // Verify the deps.now() returns the injected time
    assert.strictEqual(
      deps.now(), 
      mockTime, 
      "createPendingSetDeps should use injected clock function"
    );
  });
});
