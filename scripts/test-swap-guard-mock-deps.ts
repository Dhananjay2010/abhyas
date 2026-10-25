#!/usr/bin/env tsx
/**
 * Test swap guard with mock dependencies (no database required)
 * 
 * Tests the DI path of canSwapExercise with mock query implementations.
 */

import {
  canSwapExercise,
  type SwapGuardDeps,
} from "../src/lib/session/swap-guard";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  console.log("\nTest: DI path - unit test with mock deps\n");

  // Test 1: Mock no sets - should allow
  const mockNoSets: SwapGuardDeps = {
    query: async () => ({ data: [], error: null }),
  };
  const result1 = await canSwapExercise(mockNoSets, "mock-session-exercise-id");
  check("Mock no sets: allowed", result1.allowed === true);

  // Test 2: Mock with sets - should refuse
  const mockWithSets: SwapGuardDeps = {
    query: async () => ({ data: [{ id: "set-1" }], error: null }),
  };
  const result2 = await canSwapExercise(mockWithSets, "mock-session-exercise-id");
  check("Mock with sets: refused", result2.allowed === false);
  check(
    "Mock with sets: friendly error",
    result2.allowed === false && result2.error.includes("already logged a set"),
  );

  // Test 3: Mock error - should refuse with error message
  const mockError: SwapGuardDeps = {
    query: async () => ({ data: null, error: { message: "Database connection failed" } }),
  };
  const result3 = await canSwapExercise(mockError, "mock-session-exercise-id");
  check("Mock error: refused", result3.allowed === false);
  check(
    "Mock error: error message passed through",
    result3.allowed === false && result3.error === "Database connection failed",
  );

  return failures === 0;
}

runTests()
  .then((ok) => {
    if (ok) {
      console.log("\n✅ All swap guard mock tests passed\n");
      process.exit(0);
    } else {
      console.log(`\n❌ ${failures} test(s) failed\n`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
