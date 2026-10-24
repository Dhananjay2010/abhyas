#!/usr/bin/env tsx
/**
 * Test: Working weights are displayed as-is, not rounded to equipment grid
 * 
 * Verifies that off-grid working weights (e.g. 12kg dumbbell, 13.75kg) are
 * displayed exactly as lifted, not snapped down to equipment grid.
 */

import { suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const DUMBBELL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("1. Off-grid working weights displayed as-is (no equipment params to suggestedWeight)");

// 12kg dumbbell (off-grid: dumbbell grid is 2.5kg increments, so 10/12.5/15)
const w12 = suggestedWeight(
  { currentWorkingWeightKg: 12 },
  false,
  DUMBBELL,
);
check("12kg dumbbell shows as 12kg", w12 === 12, `got ${w12}`);

// 13.75kg (completely off-grid)
const w13 = suggestedWeight(
  { currentWorkingWeightKg: 13.75 },
  false,
  DUMBBELL,
);
check("13.75kg shows as 13.75kg", w13 === 13.75, `got ${w13}`);

// With equipment params, it would snap (proving the test is meaningful)
const w12WithEquip = suggestedWeight(
  { currentWorkingWeightKg: 12 },
  false,
  DUMBBELL,
  ["dumbbell"],
  "kg",
);
check("With equipment, 12kg snaps to 10kg", w12WithEquip === 10, `got ${w12WithEquip}`);

console.log("\n2. On-grid weights stay the same");

const w10 = suggestedWeight(
  { currentWorkingWeightKg: 10 },
  false,
  DUMBBELL,
);
check("10kg stays 10kg", w10 === 10, `got ${w10}`);

const w15 = suggestedWeight(
  { currentWorkingWeightKg: 15 },
  false,
  DUMBBELL,
);
check("15kg stays 15kg", w15 === 15, `got ${w15}`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED");
  process.exit(0);
}
