#!/usr/bin/env npx tsx
/**
 * M6: Math.random tie-break
 * 
 * Mutant: Replace deterministic hashString tie-breaker with Math.random()
 * 
 * Test: Build swap list where multiple candidates tie on priority.
 * Assert the chosen replacement is deterministic (same every time).
 */

import { readFileSync } from "fs";
import { eligibleSwapList } from "../src/lib/session/eligible-swap-list";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Find exercises that would tie (same movement pattern, mechanic, level)
const squats = catalogue.filter(e => 
  e.movement_pattern === "squat" && 
  e.mechanic === "compound" &&
  e.level_min === 0 &&
  !e.contraindicated_regions.includes("knee")
);

if (squats.length < 2) {
  console.error("✗ FAIL: Need at least 2 squat exercises for tie-break test");
  process.exit(1);
}

console.log("Testing M6: Deterministic tie-break in eligible-swap-list\n");

const sessionExerciseId = "se-test-123";
const currentSlug = squats[0].slug;

// Run swap list multiple times
const results: string[][] = [];
for (let i = 0; i < 3; i++) {
  const list = eligibleSwapList(
    currentSlug,
    catalogue,
    {
      injuries: [],
      equipmentIds: catalogue.flatMap(e => e.equipment_ids),
      userId: "u1",
    },
    sessionExerciseId,
    { category: "single_exercise", type: "bodyweight", availableMovementPatterns: ["squat"] }
  );
  results.push(list.map(e => e.slug));
}

// Check that all runs produced the same order
const firstOrder = results[0].join(",");
const allSame = results.every(order => order.join(",") === firstOrder);

if (!allSame) {
  console.error("✗ FAIL: M6 - tie-break is not deterministic");
  console.error(`  Run 1: ${results[0].join(", ")}`);
  console.error(`  Run 2: ${results[1].join(", ")}`);
  console.error(`  Run 3: ${results[2].join(", ")}`);
  console.error(`  Mutant uses Math.random() instead of hashString`);
  process.exit(1);
}

console.log("✓ PASS: M6 killed - tie-break is deterministic");
console.log(`  Candidates: ${results[0].length}`);
console.log(`  First 3: ${results[0].slice(0, 3).join(", ")}`);
console.log(`  All 3 runs identical`);
