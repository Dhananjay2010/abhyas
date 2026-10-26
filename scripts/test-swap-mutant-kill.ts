/**
 * Test: SWAP mutant - verify equipmentIds is passed to suggestedWeight
 * 
 * Tests that swap-prefill correctly passes equipmentIds for non-bodyweight exercises.
 * The SWAP mutant removes this and passes undefined, which can cause incorrect weights.
 */

import { resolveSwapPrefill } from "../src/lib/session/swap-prefill";
import { suggestedWeight } from "../src/lib/program/progression";

const mockSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  }),
} as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function testSwapMutant() {
  console.log("SWAP mutant: barbell isolation 41.25 kg case");
  
  // Set up progress for barbell calf raise at 40 kg
  const mockProgressData = {
    current_working_weight_kg: 40,
    current_target_reps: 12,
    consecutive_failures: 0,
  };

  (mockSupabase.from as unknown as (table: string) => unknown) = (table: string) => {
    if (table === "exercise_progress") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: mockProgressData, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    };
  };

  // resolveSwapPrefill should return suggestedWeight result
  const swapResult = await resolveSwapPrefill(
    mockSupabase,
    "user-1",
    "ex-1",
    false, // not deload
    ["barbell"],
    "isolation",
    "reps",
    "calf",
    undefined,
    true
  );

  // Direct suggestedWeight call WITHOUT equipmentIds (simulates mutant)
  const mutantResult = suggestedWeight(
    { currentWorkingWeightKg: 40 },
    false,
    {
      mechanic: "isolation",
      movementPattern: "calf",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    undefined // MUTANT: passes undefined instead of ["barbell"]
  );

  // Direct suggestedWeight call WITH equipmentIds (correct)
  const correctResult = suggestedWeight(
    { currentWorkingWeightKg: 40 },
    false,
    {
      mechanic: "isolation",
      movementPattern: "calf",
      metric: "reps",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    ["barbell"] // CORRECT: passes equipmentIds
  );

  check("Mutant produces 41.25 kg (wrong)", mutantResult === 41.25, `got ${mutantResult}`);
  check("Correct produces 40 kg (right)", correctResult === 40, `got ${correctResult}`);
  check("Swap prefill matches correct (not mutant)", swapResult === correctResult, `swap=${swapResult}, correct=${correctResult}, mutant=${mutantResult}`);
}

testSwapMutant().then(() => {
  console.log(failures > 0 ? `\n❌ ${failures} failure(s)\n` : "\n✅ SWAP mutant test passed\n");
  process.exit(failures > 0 ? 1 : 0);
});
