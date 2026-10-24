/**
 * Test the timing helper.
 */

import { strict as assert } from "assert";

// Mock environment
const originalEnv = process.env.NEXT_PUBLIC_ENABLE_TIMING;

// Import timing module
import { startTiming } from "../src/lib/timing";

console.log("Testing timing helper...");

// Test 1: Timing disabled by default
{
  delete process.env.NEXT_PUBLIC_ENABLE_TIMING;
  const t = startTiming("test");
  assert.strictEqual(typeof t.end, "function", "Should return timing object with end function");
  t.end(); // Should not throw
}

// Test 2: Timing object interface
{
  const t = startTiming("test");
  assert.ok(t, "Should return timing object");
  assert.strictEqual(typeof t.end, "function", "Should have end method");
  t.end(); // Should not throw
}

// Test 3: Multiple concurrent timings
{
  const t1 = startTiming("test1");
  const t2 = startTiming("test2");
  t1.end();
  t2.end();
  // Should not throw
}

// Restore environment
if (originalEnv !== undefined) {
  process.env.NEXT_PUBLIC_ENABLE_TIMING = originalEnv;
} else {
  delete process.env.NEXT_PUBLIC_ENABLE_TIMING;
}

console.log("✓ All timing tests passed");
