#!/usr/bin/env npx tsx
/**
 * Test that alternatives.ts rankAlternatives excludes kettlebell-thruster for current-knee users.
 * Consumer path: alternatives.ts line ~225 (hasKneeInjury check with isExcludedForCurrentKneeOnly)
 */

import { readFileSync } from "fs";
import { rankAlternatives } from "../src/lib/program/alternatives";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as ExerciseRow[];

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Simulate swapping a vertical_press exercise for a current-knee user
const rankedSwaps = rankAlternatives({
  original: {
    ...thruster,
    id: "test-id",
    name: "Test Press",
    slug: "test-press",
  },
  pool: catalogue,
  injuryRegions: ["knee"], // Current knee injury
  anyKneeInjury: true,
  level: "intermediate",
  equipment: ["barbell", "dumbbell", "kettlebell"],
  limit: 20,
});

const thrusterInSwaps = rankedSwaps.some(s => s.slug === "kettlebell-thruster");

if (thrusterInSwaps) {
  console.error("✗ FAIL: kettlebell-thruster found in swap alternatives for current-knee user");
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster excluded from alternatives for current-knee user");
