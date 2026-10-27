#!/usr/bin/env npx tsx
/**
 * Test that alternatives.ts rankAlternatives excludes kettlebell-thruster for current-knee users.
 * Consumer path: alternatives.ts line ~225 (hasKneeInjury check with isExcludedForCurrentKneeOnly)
 */

import { readFileSync } from "fs";
import { rankAlternatives } from "../src/lib/program/alternatives";
import type { Database } from "../src/lib/database.types";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Simulate swapping a vertical_press exercise for a current-knee user
const originalExercise = catalogue.find(e => e.movement_pattern === "vertical_press" && e.slug !== "kettlebell-thruster");
if (!originalExercise) {
  console.error("✗ FAIL: No vertical press exercise found for test");
  process.exit(1);
}

const rankedSwaps = rankAlternatives(
  originalExercise,
  catalogue.filter(e => e.movement_pattern === "vertical_press" || e.movement_pattern === "horizontal_press"),
  {
    injuryRegions: ["knee"], // Current knee injury
    anyKneeInjury: true,
    level: "intermediate",
    availableEquipment: new Set(["barbell", "dumbbell", "kettlebell"]),
    scoreFn: () => 0, // Simple scoring for test
    tieBreakFn: (slug: string) => slug.length, // Simple tie-break
    limit: 20,
  }
);

const thrusterInSwaps = rankedSwaps.some(s => s.slug === "kettlebell-thruster");

if (thrusterInSwaps) {
  console.error("✗ FAIL: kettlebell-thruster found in swap alternatives for current-knee user");
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster excluded from alternatives for current-knee user");
