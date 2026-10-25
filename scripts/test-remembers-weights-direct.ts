#!/usr/bin/env tsx
/**
 * Direct unit test for remembersWeights handling in resolveSwapWeights and resolveSwapPrefill.
 * 
 * These tests verify behavior when remembersWeights=false with a mock that returns actual data.
 * This catches mutants (a) and (b) that would survive test-swap-exercise-core.ts.
 */

import { resolveSwapWeights } from "../src/lib/session/resolve-swap-weights";
import { resolveSwapPrefill } from "../src/lib/session/swap-prefill";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

// Mock Supabase that returns progress data (to show mutant would use it incorrectly)
function createMockSupabaseWithProgress() {
  const chain = {
    eq: function() { return this; },
    maybeSingle: async function() {
      // @ts-ignore
      if (this._table === "sessions") {
        return { data: { is_deload: false }, error: null };
      }
      // @ts-ignore
      if (this._table === "exercise_progress") {
        return { data: { current_working_weight_kg: 100 }, error: null };
      }
      return { data: null, error: null };
    },
  };

  return {
    from: (table: string) => ({
      select: () => Object.assign({ _table: table }, chain),
    }),
  } as any;
}

async function main() {
  console.log("Direct remembersWeights Tests\n");

  // Test 1: resolveSwapWeights with remembersWeights=false and progress in DB
  console.log("Test 1: resolveSwapWeights with remembersWeights=false (progress exists)\n");
  
  const mockSupabase1 = createMockSupabaseWithProgress();
  const result1 = await resolveSwapWeights(
    mockSupabase1,
    "user-123",
    "session-123",
    "exercise-456",
    ["barbell"],
    "reps",
    "horizontal_press",
    false, // remembersWeights - should ignore progress
  );

  check(
    "remembersWeights=false → null prefill (even though progress=100kg exists)",
    result1.weightPrefill === null,
    `got ${result1.weightPrefill}, expected null`,
  );
  check(
    "remembersWeights=false → null working weight (even though progress exists)",
    result1.workingWeightKg === null,
    `got ${result1.workingWeightKg}, expected null`,
  );

  // Test 2: resolveSwapWeights with remembersWeights=true should use progress
  console.log("\nTest 2: resolveSwapWeights with remembersWeights=true (progress exists)\n");
  
  const mockSupabase2 = createMockSupabaseWithProgress();
  const result2 = await resolveSwapWeights(
    mockSupabase2,
    "user-123",
    "session-123",
    "exercise-456",
    ["barbell"],
    "reps",
    "horizontal_press",
    true, // remembersWeights - should use progress
  );

  check(
    "remembersWeights=true → non-null prefill from progress",
    result2.weightPrefill !== null,
    `got ${result2.weightPrefill}`,
  );
  check(
    "remembersWeights=true → working weight from progress",
    result2.workingWeightKg === 100,
    `got ${result2.workingWeightKg}`,
  );

  // Test 3: resolveSwapPrefill with remembersWeights=false
  console.log("\nTest 3: resolveSwapPrefill with remembersWeights=false (progressValue provided)\n");
  
  const mockSupabase3 = createMockSupabaseWithProgress();
  const result3 = await resolveSwapPrefill(
    mockSupabase3,
    "user-123",
    "exercise-456",
    false, // isDeload
    ["barbell"],
    "reps",
    "horizontal_press",
    100, // progressValue provided
    false, // remembersWeights - should ignore progressValue
  );

  check(
    "remembersWeights=false → null prefill (ignores progressValue=100)",
    result3 === null,
    `got ${result3}, expected null`,
  );

  // Test 4: resolveSwapPrefill with remembersWeights=true
  console.log("\nTest 4: resolveSwapPrefill with remembersWeights=true (progressValue provided)\n");
  
  const mockSupabase4 = createMockSupabaseWithProgress();
  const result4 = await resolveSwapPrefill(
    mockSupabase4,
    "user-123",
    "exercise-456",
    false, // isDeload
    ["barbell"],
    "reps",
    "horizontal_press",
    100, // progressValue provided
    true, // remembersWeights - should use progressValue
  );

  check(
    "remembersWeights=true → uses progressValue",
    result4 === 100,
    `got ${result4}`,
  );

  console.log("\n✅ All direct remembersWeights tests passed");
  console.log("\nMutants killed by these tests:");
  console.log("  (a) removing !remembersWeights check in resolveSwapWeights → FAILS test 1");
  console.log("      (returns 100 or non-null instead of null)");
  console.log("  (b) removing !remembersWeights check in resolveSwapPrefill → FAILS test 3");
  console.log("      (returns 100 instead of null)\n");
}

main().catch((e) => {
  console.error("Test error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
