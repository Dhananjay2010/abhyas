/**
 * Test PR detection grouping logic with out-of-order inserts.
 * 
 * Real sessions can have sets completed out of order (e.g., if logged retroactively
 * or across tabs). The PR detection must group sets by chronological completed_at,
 * not by insertion order.
 * 
 *   npx tsx scripts/test-pr-grouping.ts
 */

import { detectSetPRs } from "../src/lib/exercise-history";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Chronological order with out-of-order insertion");
{
  // Simulate sets inserted out of order but with chronological completed_at
  const sets = [
    { reps: 8, weight_kg: 60, duration_seconds: null }, // Session 1, first
    { reps: 10, weight_kg: 60, duration_seconds: null }, // Session 1, second (PR: most reps)
    { reps: 8, weight_kg: 65, duration_seconds: null }, // Session 2, first (PR: heaviest + e1rm)
    { reps: 8, weight_kg: 60, duration_seconds: null }, // Session 2, second
  ];

  // Check set 0: first ever, should be PRs
  const prs0 = detectSetPRs(sets, 0, "reps");
  check("set 0 has PRs", prs0.length > 0, `got ${prs0.join(", ")}`);
  check("set 0: heaviest_weight", prs0.includes("heaviest_weight"));
  check("set 0: best_e1rm", prs0.includes("best_e1rm"));
  check("set 0: most_reps", prs0.includes("most_reps"));

  // Check set 1: more reps than set 0
  const prs1 = detectSetPRs(sets, 1, "reps");
  check("set 1 has most_reps PR", prs1.includes("most_reps"));

  // Check set 2: heavier weight than any before
  const prs2 = detectSetPRs(sets, 2, "reps");
  check("set 2 has PRs", prs2.length > 0);
  check("set 2: heaviest_weight", prs2.includes("heaviest_weight"));
  check("set 2: best_e1rm", prs2.includes("best_e1rm"));

  // Check set 3: no PRs (same as set 0 but later)
  const prs3 = detectSetPRs(sets, 3, "reps");
  check("set 3 has no PRs", prs3.length === 0);
}

console.log("\n2. PR detection with time-based exercises");
{
  const sets = [
    { reps: null, weight_kg: null, duration_seconds: 30 }, // First plank
    { reps: null, weight_kg: null, duration_seconds: 45 }, // PR: longest
    { reps: null, weight_kg: null, duration_seconds: 40 }, // No PR
    { reps: null, weight_kg: null, duration_seconds: 60 }, // PR: longest
  ];

  const prs0 = detectSetPRs(sets, 0, "seconds");
  check("time-based set 0 is a PR", prs0.includes("longest_duration"));

  const prs1 = detectSetPRs(sets, 1, "seconds");
  check("45s is a PR", prs1.includes("longest_duration"));

  const prs2 = detectSetPRs(sets, 2, "seconds");
  check("40s is not a PR", prs2.length === 0);

  const prs3 = detectSetPRs(sets, 3, "seconds");
  check("60s is a PR", prs3.includes("longest_duration"));
}

console.log("\n3. Bodyweight to weighted transition");
{
  const sets = [
    { reps: 10, weight_kg: 0, duration_seconds: null }, // Bodyweight
    { reps: 12, weight_kg: 0, duration_seconds: null }, // PR: most reps
    { reps: 8, weight_kg: 20, duration_seconds: null }, // First weighted (PR: heaviest, e1rm)
    { reps: 10, weight_kg: 20, duration_seconds: null }, // PR: e1rm
    { reps: 15, weight_kg: 0, duration_seconds: null }, // Back to bodyweight (PR: most reps)
  ];

  const prs0 = detectSetPRs(sets, 0, "reps");
  check("bodyweight first is a PR", prs0.includes("most_reps"));

  const prs1 = detectSetPRs(sets, 1, "reps");
  check("12 reps bodyweight is a PR", prs1.includes("most_reps"));

  const prs2 = detectSetPRs(sets, 2, "reps");
  check("first weighted has heaviest", prs2.includes("heaviest_weight"));
  check("first weighted has best_e1rm", prs2.includes("best_e1rm"));

  const prs3 = detectSetPRs(sets, 3, "reps");
  check("10 reps at 20kg improves e1rm", prs3.includes("best_e1rm"));

  const prs4 = detectSetPRs(sets, 4, "reps");
  check("15 reps bodyweight is most_reps PR", prs4.includes("most_reps"));
  check("15 reps bodyweight doesn't beat weighted e1rm", !prs4.includes("best_e1rm"));
}

console.log("\n4. Multiple PRs in one set");
{
  const sets = [
    { reps: 8, weight_kg: 60, duration_seconds: null }, // First
    { reps: 10, weight_kg: 70, duration_seconds: null }, // PR: all three
  ];

  const prs1 = detectSetPRs(sets, 1, "reps");
  check("multiple PRs detected", prs1.length === 3);
  check("has heaviest_weight", prs1.includes("heaviest_weight"));
  check("has best_e1rm", prs1.includes("best_e1rm"));
  check("has most_reps", prs1.includes("most_reps"));
}

console.log("\n5. Edge cases");
{
  const emptySets: Array<{ reps: number | null; weight_kg: number | null; duration_seconds: number | null }> = [];
  check("empty sets returns empty", detectSetPRs(emptySets, 0, "reps").length === 0);

  const singleSet = [{ reps: 10, weight_kg: 60, duration_seconds: null }];
  const prsSingle = detectSetPRs(singleSet, 0, "reps");
  check("single set is all PRs", prsSingle.length === 3);

  check("invalid index returns empty", detectSetPRs(singleSet, 5, "reps").length === 0);
  check("negative index returns empty", detectSetPRs(singleSet, -1, "reps").length === 0);
}

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
}
