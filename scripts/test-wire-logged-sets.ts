/**
 * Test wire-logged-sets with REAL key format from buildTodayRows.
 *
 * FIX (c): Real keys are s<N>, not "actual-N". Test uses actual buildTodayRows
 * and wireLoggedSets to verify end-to-end wiring.
 *
 * Also includes source assertion that page.tsx imports and calls wireLoggedSets.
 */

import { buildTodayRows } from "@/lib/today/build-today-rows";
import { wireLoggedSets } from "@/lib/today/wire-logged-sets";
import { readFileSync } from "fs";

// Source assertion: page.tsx must import and call wireLoggedSets
const pageSource = readFileSync("src/app/today/page.tsx", "utf-8");
if (!pageSource.includes("wireLoggedSets")) {
  console.error("✗ page.tsx must call wireLoggedSets");
  process.exit(1);
}
if (!pageSource.includes('await import("@/lib/today/wire-logged-sets")')) {
  console.error("✗ page.tsx must import wire-logged-sets module");
  process.exit(1);
}
console.log("✓ Source assertion: page.tsx imports and calls wireLoggedSets");

const actual = [
  {
    order_index: 0,
    planned_sets: 5,
    planned_reps_min: 8,
    planned_reps_max: 12,
    rest_seconds: 180,
    status: "completed" as const,
    metric: "reps" as const,
    swapped_from_exercise_id: null,
    exercises: {
      name: "Bench Press",
      cue: null,
    },
  },
  {
    order_index: 1,
    planned_sets: 3,
    planned_reps_min: 30,
    planned_reps_max: 60,
    rest_seconds: 60,
    status: "completed" as const,
    metric: "seconds" as const,
    swapped_from_exercise_id: null,
    exercises: {
      name: "Plank",
      cue: null,
    },
  },
];

const template: never[] = [];

// Build rows using REAL buildTodayRows (produces s<N> keys)
const rows = buildTodayRows({ actual: actual as unknown as Parameters<typeof buildTodayRows>[0]["actual"], template, isDeload: false });

if (rows.length !== 2) {
  console.error(`✗ Expected 2 rows, got ${rows.length}`);
  process.exit(1);
}

if (rows[0].key !== "s0" || rows[1].key !== "s1") {
  console.error(`✗ Expected keys s0 and s1, got ${rows[0].key} and ${rows[1].key}`);
  process.exit(1);
}

// Mock logged sets data
const loggedSetsData = [
  {
    order_index: 0,
    metric: "reps" as const,
    session_sets: [
      { reps: 10, weight_kg: 40, duration_seconds: null, is_warmup_set: true }, // warm-up
      { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
      { reps: 10, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
      { reps: 9, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
    ],
  },
  {
    order_index: 1,
    metric: "seconds" as const,
    session_sets: [
      { reps: null, weight_kg: null, duration_seconds: 45, is_warmup_set: false },
      { reps: null, weight_kg: null, duration_seconds: 42, is_warmup_set: false },
      { reps: null, weight_kg: null, duration_seconds: 40, is_warmup_set: false },
    ],
  },
];

// Wire logged sets using REAL wireLoggedSets
wireLoggedSets(rows as unknown as Parameters<typeof wireLoggedSets>[0], loggedSetsData, "metric");

// Verify wiring
if (!rows[0].loggedSets) {
  console.error("✗ Bench Press loggedSets is null");
  process.exit(1);
}

if (!rows[0].loggedSets.includes("10, 10, 9")) {
  console.error(`✗ Bench Press wrong format: ${rows[0].loggedSets}`);
  process.exit(1);
}

if (!rows[0].loggedSets.includes("80")) {
  console.error(`✗ Bench Press missing weight: ${rows[0].loggedSets}`);
  process.exit(1);
}

if (!rows[1].loggedSets) {
  console.error("✗ Plank loggedSets is null");
  process.exit(1);
}

if (!rows[1].loggedSets.includes("45s") || !rows[1].loggedSets.includes("42s")) {
  console.error(`✗ Plank wrong format: ${rows[1].loggedSets}`);
  process.exit(1);
}

console.log("✓ Real wireLoggedSets test passed");
console.log(`  Bench: ${rows[0].loggedSets}`);
console.log(`  Plank: ${rows[1].loggedSets}`);
