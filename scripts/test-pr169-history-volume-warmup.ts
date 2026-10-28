#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up LOW-4: History detail page Volume excludes warm-up sets.
 * 
 * Verifies that volume calculation filters out warm-up sets, matching the same
 * logic used for duration (both exclude warm-ups).
 * 
 *   npx tsx scripts/test-pr169-history-volume-warmup.ts
 */

(function() {
let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

type SetRow = {
  reps: number | null;
  weight_kg: string | null;
  is_warmup_set: boolean;
};

function computeVolume(sets: SetRow[]): number {
  return sets
    .filter((s) => !s.is_warmup_set)
    .reduce(
      (n, s) => n + (s.reps ?? 0) * Number(s.weight_kg ?? 0),
      0,
    );
}

(function main() {
  console.log("\nPR #169 follow-up LOW-4: History volume excludes warm-up sets\n");

  console.log("Case 1: Working sets only");
  {
    const sets: SetRow[] = [
      { reps: 10, weight_kg: "100", is_warmup_set: false },
      { reps: 10, weight_kg: "100", is_warmup_set: false },
      { reps: 10, weight_kg: "100", is_warmup_set: false },
    ];
    const volume = computeVolume(sets);
    assertEquals(volume, 3000, "volume = 3 × 10 × 100 = 3000 kg");
  }

  console.log("\nCase 2: Working sets + warm-up sets (warm-ups excluded)");
  {
    const sets: SetRow[] = [
      { reps: 8, weight_kg: "60", is_warmup_set: true },   // warm-up: 480 kg (excluded)
      { reps: 5, weight_kg: "80", is_warmup_set: true },   // warm-up: 400 kg (excluded)
      { reps: 10, weight_kg: "100", is_warmup_set: false }, // working: 1000 kg
      { reps: 10, weight_kg: "100", is_warmup_set: false }, // working: 1000 kg
      { reps: 10, weight_kg: "100", is_warmup_set: false }, // working: 1000 kg
    ];
    const volume = computeVolume(sets);
    // Volume should be 3000 kg (only working sets), not 3880 kg (including warm-ups)
    assertEquals(volume, 3000, "volume excludes warm-up sets");
  }

  console.log("\nCase 3: Warm-up sets only");
  {
    const sets: SetRow[] = [
      { reps: 8, weight_kg: "60", is_warmup_set: true },
      { reps: 5, weight_kg: "80", is_warmup_set: true },
    ];
    const volume = computeVolume(sets);
    assertEquals(volume, 0, "volume = 0 when only warm-ups");
  }

  console.log("\nCase 4: Mixed with null values");
  {
    const sets: SetRow[] = [
      { reps: 8, weight_kg: "60", is_warmup_set: true },    // warm-up (excluded)
      { reps: 10, weight_kg: "100", is_warmup_set: false }, // 1000 kg
      { reps: null, weight_kg: "100", is_warmup_set: false }, // 0 (null reps)
      { reps: 10, weight_kg: null, is_warmup_set: false },    // 0 (null weight)
      { reps: 10, weight_kg: "100", is_warmup_set: false }, // 1000 kg
    ];
    const volume = computeVolume(sets);
    assertEquals(volume, 2000, "handles null values correctly");
  }

  console.log("\nCase 5: Empty sets");
  {
    const sets: SetRow[] = [];
    const volume = computeVolume(sets);
    assertEquals(volume, 0, "volume = 0 for empty sets");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history volume warm-up tests passed!");
})();
})();
