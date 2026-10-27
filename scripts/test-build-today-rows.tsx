#!/usr/bin/env tsx
/**
 * Test buildTodayRows (MEDIUM-1): ensures Today page calls the builder
 * with actual rows or template + isDeload.
 * 
 * Must FAIL if buildTodayRows passes false internally.
 */

import { buildTodayRows } from "@/lib/today/build-today-rows";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test buildTodayRows\n");

const template = [
  {
    order_index: 0,
    target_sets: 4,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 180,
    exercises: { name: "Bench Press", cue: null, metric: "reps" as const },
  },
  {
    order_index: 1,
    target_sets: 5,
    target_reps_min: 6,
    target_reps_max: 10,
    rest_seconds: 240,
    exercises: { name: "Squat", cue: null, metric: "reps" as const },
  },
];

console.log("Case 1: No actual rows, normal week\n");
const result1 = buildTodayRows({ actual: null, template, isDeload: false });
check("Returns 2 rows", result1.length === 2);
check("Bench sets unchanged", result1[0].sets === 4, `got ${result1[0].sets}`);
check("Squat sets unchanged", result1[1].sets === 5, `got ${result1[1].sets}`);

console.log("\nCase 2: No actual rows, deload week\n");
const result2 = buildTodayRows({ actual: null, template, isDeload: true });
check("Returns 2 rows", result2.length === 2);
check("Bench sets reduced (deload)", result2[0].sets === 2, `got ${result2[0].sets} (from 4)`);
check("Squat sets reduced (deload)", result2[1].sets === 3, `got ${result2[1].sets} (from 5)`);
check("Bench reps unchanged", result2[0].repsMin === 8 && result2[0].repsMax === 12);

console.log("\nCase 3: Actual rows present (win over template)\n");
const actual = [
  {
    order_index: 0,
    planned_sets: 3,
    planned_reps_min: 10,
    planned_reps_max: 15,
    rest_seconds: 120,
    status: "pending" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: null,
    exercises: { name: "Dumbbell Press", cue: "slow eccentric" },
  },
];

const result3 = buildTodayRows({ actual, template, isDeload: true });
check("Returns 1 row (actual)", result3.length === 1);
check("Actual sets used (not template)", result3[0].sets === 3, `got ${result3[0].sets}`);
check("Actual name used", result3[0].name === "Dumbbell Press");
check("Actual cue used", result3[0].cue === "slow eccentric");
check("Not skipped", !result3[0].skipped);
check("Not swapped", !result3[0].swappedIn);

console.log("\nCase 4: Actual rows with skipped exercise\n");
const actualSkipped = [
  {
    order_index: 0,
    planned_sets: 4,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 180,
    status: "skipped" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: null,
    exercises: { name: "Bench Press", cue: null },
  },
];

const result4 = buildTodayRows({ actual: actualSkipped, template, isDeload: false });
check("Skipped flag set", result4[0].skipped);

console.log("\nCase 5: Actual rows with swapped exercise\n");
const actualSwapped = [
  {
    order_index: 0,
    planned_sets: 4,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 180,
    status: "pending" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: "old-exercise-id",
    exercises: { name: "Dumbbell Press", cue: null },
  },
];

const result5 = buildTodayRows({ actual: actualSwapped, template, isDeload: false });
check("Swapped flag set", result5[0].swappedIn);

console.log("\n✅ All buildTodayRows tests passed");
console.log("\nMutant coverage:");
console.log("  M1: passing false internally → would fail case 2");
console.log("  M1b: skipping isDeload → would fail case 2\n");