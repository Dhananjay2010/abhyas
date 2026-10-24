#!/usr/bin/env tsx
/**
 * Test: hasStartedAnySession helper
 *
 * Ensures the pure helper correctly identifies if user has started any strength or yoga session.
 */

import { hasStartedAnySession } from "../src/lib/today/has-started-any";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test 1: No sessions
console.log("\n=== Test 1: No sessions ===\n");
test("Returns false when no sessions", () => {
  const result = hasStartedAnySession({ sessions: [] });
  assert(result === false, "Expected false for no sessions");
});

// Test 2: Yoga session counts
console.log("\n=== Test 2: Yoga session counts ===\n");
test("Returns true for started yoga session", () => {
  const result = hasStartedAnySession({
    sessions: [{ actual_type: "yoga", started_at: "2026-10-22T10:00:00Z" }],
  });
  assert(result === true, "Expected true for yoga session");
});

// Test 3: Breathe session doesn't count
console.log("\n=== Test 3: Breathe session doesn't count ===\n");
test("Returns false for meditation session only", () => {
  const result = hasStartedAnySession({
    sessions: [{ actual_type: "meditation", started_at: "2026-10-22T10:00:00Z" }],
  });
  assert(result === false, "Expected false for meditation only");
});

// Test 4: Weights session counts
console.log("\n=== Test 4: Weights session counts ===\n");
test("Returns true for weights session", () => {
  const result = hasStartedAnySession({
    sessions: [{ actual_type: "weights", started_at: "2026-10-22T10:00:00Z" }],
  });
  assert(result === true, "Expected true for weights session");
});

// Test 5: Bodyweight session counts
console.log("\n=== Test 5: Bodyweight session counts ===\n");
test("Returns true for bodyweight session", () => {
  const result = hasStartedAnySession({
    sessions: [{ actual_type: "bodyweight", started_at: "2026-10-22T10:00:00Z" }],
  });
  assert(result === true, "Expected true for bodyweight session");
});

// Test 6: Null started_at doesn't count
console.log("\n=== Test 6: Null started_at doesn't count ===\n");
test("Returns false when started_at is null", () => {
  const result = hasStartedAnySession({
    sessions: [{ actual_type: "weights", started_at: null }],
  });
  assert(result === false, "Expected false when started_at is null");
});

// Test 7: Mix of sessions
console.log("\n=== Test 7: Mix of sessions ===\n");
test("Returns true when at least one countable session", () => {
  const result = hasStartedAnySession({
    sessions: [
      { actual_type: "meditation", started_at: "2026-10-22T09:00:00Z" },
      { actual_type: "weights", started_at: null },
      { actual_type: "yoga", started_at: "2026-10-22T10:00:00Z" },
    ],
  });
  assert(result === true, "Expected true when at least one countable session");
});

console.log("\n==================================================");
console.log("📊 Test Results: All tests passed");
console.log("✅ All has-started-any tests passed!");
