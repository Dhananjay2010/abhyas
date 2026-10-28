#!/usr/bin/env npx tsx
/**
 * M6: Tie-breaking must be deterministic (hash-based, not Math.random).
 * 
 * M6 mutant: const tieBreakFn = (slug: string) => Math.random()
 * 
 * When multiple alternatives have identical scores, the tie-breaker ensures
 * stable ordering across Today SSR, start session, and background sweeps.
 * 
 * This test verifies that replace-banned produces the same result across
 * multiple invocations for the same input (deterministic).
 */

import { readFileSync } from "fs";
import { replaceBannedInPlanned } from "../src/lib/program/replace-banned-in-planned";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found");
  process.exit(1);
}

console.log("Testing M6: Tie-breaking determinism\n");

const planned = [
  {
    id: "pde1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const generatorInput = {
  userId: "u1",
  blockNumber: 1,
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: catalogue.flatMap(e => e.equipment_ids),
  currentInjuryRegions: ["knee" as const],
  anyKneeInjury: true,
  catalogue,
};

// Run replacement 5 times and collect replacement IDs
const replacementIds: string[] = [];
for (let i = 0; i < 5; i++) {
  const result = replaceBannedInPlanned(planned, catalogue, generatorInput);
  if (!result.changed) {
    console.error("✗ FAIL: No replacement occurred");
    process.exit(1);
  }
  replacementIds.push(result.rows[0].exercise_id);
}

// All 5 runs must produce the same replacement ID
const uniqueIds = new Set(replacementIds);
if (uniqueIds.size !== 1) {
  console.error("✗ FAIL: M6 - Tie-breaking is non-deterministic");
  console.error(`  M6 mutant: const tieBreakFn = (slug: string) => Math.random()`);
  console.error(`  Expected: Same replacement across 5 runs`);
  console.error(`  Got:      ${uniqueIds.size} different IDs: ${Array.from(uniqueIds).join(', ')}`);
  process.exit(1);
}

const replacementSlug = catalogue.find(e => e.id === replacementIds[0])?.slug || 'unknown';

console.log("✓ PASS: M6 killed - Tie-breaking is deterministic");
console.log(`  Banned:      kettlebell-thruster (${thruster.id})`);
console.log(`  Replacement: ${replacementSlug} (${replacementIds[0]})`);
console.log(`  Runs:        5/5 identical ✓`);
