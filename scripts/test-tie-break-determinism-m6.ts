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
import { buildEligibleSwapList } from "../src/lib/session/eligible-swap-list";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import { buildCleanupGeneratorInput } from "../src/lib/program/apply-banned-cleanup";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Find a goblet squat as current exercise
const goblet = catalogue.find(e => e.slug === "goblet-squat");

if (!goblet) {
  console.error("✗ FAIL: goblet-squat not found");
  process.exit(1);
}

console.log("Testing M6: Deterministic tie-break in eligible-swap-list\n");

const generatorInput = {
  userId: "u1",
  blockNumber: 1,
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 25,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: catalogue.flatMap(e => e.equipment_ids),
  currentInjuryRegions: [],
  anyKneeInjury: false,
  catalogue,
};

// Run swap list multiple times
const results: string[][] = [];
for (let i = 0; i < 3; i++) {
  const list = buildEligibleSwapList({
    currentExercise: goblet,
    sessionExerciseId: "se-test-123",
    generatorInput,
    pool: catalogue,
    alreadyInSession: new Set([goblet.id]),
  });
  results.push(list.map(e => e.slug));
}

// Check that all runs produced the same order
const firstOrder = results[0].join(",");
const allSame = results.every(order => order.join(",") === firstOrder);

if (!allSame) {
  console.error("✗ FAIL: M6 - swap list order is not deterministic");
  console.error(`  Run 1: ${results[0].slice(0, 5).join(", ")}`);
  console.error(`  Run 2: ${results[1].slice(0, 5).join(", ")}`);
  console.error(`  Run 3: ${results[2].slice(0, 5).join(", ")}`);
  console.error(`  Mutant replaced hashString tie-breaker with Math.random()`);
  process.exit(1);
}

console.log("✓ PASS: M6 killed - swap list is deterministic across runs");
console.log(`  Exercise: ${goblet.slug}`);
console.log(`  Swap candidates: ${results[0].length}`);
console.log(`  First 3: ${results[0].slice(0, 3).join(", ")}`);
