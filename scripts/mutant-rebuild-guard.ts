#!/usr/bin/env tsx
/**
 * Mutant test: Rebuild guard
 * 
 * Verifies that block 2+ does NOT pass startedOn to the generator,
 * preserving the original weekday mapping.
 */

import { strict as assert } from "assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate.js";

// Minimal valid catalogue
const CATALOGUE: CandidateExercise[] = [
  { id: "1", slug: "squat", name: "Squat", movement_pattern: "squat", mechanic: "compound", metric: "reps", primary_muscles: ["quads"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "2", slug: "bench", name: "Bench Press", movement_pattern: "horizontal_press", mechanic: "compound", metric: "reps", primary_muscles: ["chest"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "3", slug: "row", name: "Row", movement_pattern: "horizontal_pull", mechanic: "compound", metric: "reps", primary_muscles: ["upper_back"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "4", slug: "deadlift", name: "Deadlift", movement_pattern: "hinge", mechanic: "compound", metric: "reps", primary_muscles: ["hamstrings", "glutes"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "high", tracks: ["weights"], default_rest_seconds: 180, category: "strength" },
  { id: "5", slug: "press", name: "Press", movement_pattern: "vertical_press", mechanic: "compound", metric: "reps", primary_muscles: ["front_delts"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
];

console.log("Mutant: Rebuild guard\n");

// Baseline: Block 2+ without startedOn uses default [1,3,5] mapping
const baselineInput: GeneratorInput = {
  userId: "test",
  blockNumber: 2, // Existing plan
  goal: "general_fitness",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  preferredSessionMinutes: 60,
  catalogue: CATALOGUE,
  // NO startedOn
};

const baseline = generateProgram(baselineInput);
const baselineDays = baseline.days
  .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
  .map(d => d.dayIndex)
  .sort((a, b) => a - b);

console.log("Baseline (block 2, NO startedOn):");
console.log(`  Training days: ${baselineDays.join(", ")}`);
assert.deepEqual(baselineDays, [1, 3, 5], "Baseline: uses original [1,3,5] mapping");

// MUTANT: Block 2 WITH startedOn = Thursday should NOT change mapping
const thursday = "2026-10-29"; // Thursday
const mutantInput: GeneratorInput = {
  ...baselineInput,
  startedOn: thursday, // This should be IGNORED for block 2+
};

const mutant = generateProgram(mutantInput);
const mutantDays = mutant.days
  .filter(d => d.dayType === "weights" || d.dayType === "bodyweight")
  .map(d => d.dayIndex)
  .sort((a, b) => a - b);

console.log("\nMutant (block 2, WITH startedOn=Thursday):");
console.log(`  Training days: ${mutantDays.join(", ")}`);

// The mutant should produce DIFFERENT results if the guard is removed
// (would anchor to Thursday instead of preserving [1,3,5])
if (JSON.stringify(mutantDays) !== JSON.stringify([1, 3, 5])) {
  console.error("\n❌ MUTANT SURVIVED: Block 2 with startedOn changed the mapping!");
  console.error(`   Expected [1,3,5], got [${mutantDays.join(", ")}]`);
  process.exit(1);
}

console.log("\n✅ MUTANT KILLED: Block 2+ correctly ignores startedOn");
console.log("   Mapping stayed [1,3,5] as expected");
