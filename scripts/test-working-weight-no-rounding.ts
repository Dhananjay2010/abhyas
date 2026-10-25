#!/usr/bin/env tsx
/**
 * Test: Working weight display without equipment rounding
 * 
 * PENDING PR #121: This test verifies that suggestedWeight() in non-deload mode
 * returns the exact working weight when equipment info is provided, without
 * snapping it to the equipment grid. This behavior is added by PR #121.
 * 
 * Until #121 merges to main, this test will FAIL because suggestedWeight()
 * currently snaps even non-deload weights to the grid.
 * 
 * DO NOT add this to the npm test chain until PR #121 is on main.
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

console.log("Working weight display (NO grid rounding in non-deload mode)");
console.log("PENDING: This test turns green once PR #121 is on main\n");

// 12kg dumbbell (off-grid: dumbbell grid is 2.5kg increments)
const w12 = suggestedWeight(
  { currentWorkingWeightKg: 12 },
  false, // non-deload
  DUMBBELL,
  ["dumbbell"],
);
check("12kg dumbbell working weight stays 12kg (not snapped to 10kg)", w12 === 12, `got ${w12}`);

// 13.75kg (completely off-grid)
const w13 = suggestedWeight(
  { currentWorkingWeightKg: 13.75 },
  false, // non-deload
  DUMBBELL,
  ["dumbbell"],
);
check("13.75kg working weight stays 13.75kg (not snapped)", w13 === 13.75, `got ${w13}`);

// On-grid weights should also stay the same
const w10 = suggestedWeight(
  { currentWorkingWeightKg: 10 },
  false,
  DUMBBELL,
  ["dumbbell"],
);
check("10kg stays 10kg", w10 === 10, `got ${w10}`);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks (EXPECTED until PR #121 merges)`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED (PR #121 is on main)");
  process.exit(0);
}
