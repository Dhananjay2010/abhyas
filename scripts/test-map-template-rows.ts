/**
 * Test mapTemplateRows (MEDIUM-1): ensures Today's row mapping applies deload.
 * This test covers the production call site in today/page.tsx.
 */

import { mapTemplateRows, type TemplateRow } from "@/lib/today/map-template-rows";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

const template: TemplateRow[] = [
  {
    order_index: 0,
    exercises: { name: "Bench Press", cue: null, metric: "reps" },
    target_sets: 4,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 180,
  },
  {
    order_index: 1,
    exercises: { name: "Squat", cue: "Deep", metric: "reps" },
    target_sets: 5,
    target_reps_min: 6,
    target_reps_max: 10,
    rest_seconds: 240,
  },
  {
    order_index: 2,
    exercises: { name: "Plank", cue: null, metric: "seconds" },
    target_sets: 3,
    target_reps_min: 30,
    target_reps_max: 60,
    rest_seconds: 90,
  },
];

console.log("\nTest mapTemplateRows (MEDIUM-1):\n");

// Test 1: Non-deload returns original prescription
const normal = mapTemplateRows(template, false);
check("Non-deload: 3 rows returned", normal.length === 3);
check("Bench sets unchanged", normal[0].sets === 4, "got 4");
check("Bench reps unchanged", normal[0].repsMin === 8 && normal[0].repsMax === 12, "8-12");
check("Squat sets unchanged", normal[1].sets === 5, "got 5");
check("Plank rest unchanged", normal[2].restSeconds === 90, "got 90");

// Test 2: Deload applies transformation
const deload = mapTemplateRows(template, true);
check("Deload: 3 rows returned", deload.length === 3);
check("Bench sets reduced", deload[0].sets === 2, "got 2");
check("Bench reps unchanged", deload[0].repsMin === 8 && deload[0].repsMax === 12, "still 8-12");
check("Squat sets reduced", deload[1].sets === 3, "got 3 (from 5)");
check("Plank sets reduced", deload[2].sets === 2, "got 2 (from 3)");
check("Rest seconds unchanged", deload[2].restSeconds === 90, "got 90");

// Test 3: Keys are correct
check("Keys are prefixed", normal[0].key === "p0" && normal[1].key === "p1");

// Test 4: Null values handled
const nullTemplate: TemplateRow[] = [
  {
    order_index: 0,
    exercises: null,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    rest_seconds: null,
  },
];
const nullResult = mapTemplateRows(nullTemplate, false);
check("Null exercise name becomes empty", nullResult[0].name === "");
check("Null sets stays null", nullResult[0].sets === null);

console.log("\n✅ All mapTemplateRows tests passed\n");
