#!/usr/bin/env tsx
/**
 * Mutant test: Anchor guard
 * 
 * Verifies that removing the `startedOn` parameter from the generator
 * breaks new plan anchoring.
 */

import { strict as assert } from "assert";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate.js";
import { isoWeekday } from "../src/lib/dates.js";

// Minimal valid catalogue
const CATALOGUE: CandidateExercise[] = [
  { id: "1", slug: "squat", name: "Squat", movement_pattern: "squat", mechanic: "compound", metric: "reps", primary_muscles: ["quads"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "2", slug: "bench", name: "Bench Press", movement_pattern: "horizontal_press", mechanic: "compound", metric: "reps", primary_muscles: ["chest"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "3", slug: "row", name: "Row", movement_pattern: "horizontal_pull", mechanic: "compound", metric: "reps", primary_muscles: ["upper_back"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "4", slug: "deadlift", name: "Deadlift", movement_pattern: "hinge", mechanic: "compound", metric: "reps", primary_muscles: ["hamstrings", "glutes"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "high", tracks: ["weights"], default_rest_seconds: 180, category: "strength" },
  { id: "5", slug: "press", name: "Press", movement_pattern: "vertical_press", mechanic: "compound", metric: "reps", primary_muscles: ["front_delts"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
];

console.log("Mutant: Anchor guard\n");

// Baseline: Thursday sign-up with startedOn should give Thursday = Full Body A
const thursday = "2026-10-29"; // Thursday
const thursdayWeekday = isoWeekday(thursday); // 4

const baselineInput: GeneratorInput = {
  userId: "test",
  blockNumber: 1,
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
  startedOn: thursday,
};

const baseline = generateProgram(baselineInput);
const baselineThursday = baseline.days.find(d => d.dayIndex === thursdayWeekday);

console.log("Baseline (WITH startedOn):");
console.log(`  Thursday (day ${thursdayWeekday}) = ${baselineThursday?.label}`);
assert.equal(baselineThursday?.label, "Full Body A", "Baseline: Thursday = Full Body A");

// MUTANT: Remove startedOn, should break anchoring
const mutantInput: GeneratorInput = {
  ...baselineInput,
  startedOn: undefined,
};

const mutant = generateProgram(mutantInput);
const mutantThursday = mutant.days.find(d => d.dayIndex === thursdayWeekday);

console.log("\nMutant (WITHOUT startedOn):");
console.log(`  Thursday (day ${thursdayWeekday}) = ${mutantThursday?.label}`);

// The mutant should produce DIFFERENT results (default mapping, not anchored)
// Default 3-day is [1,3,5] = Mon/Wed/Fri, so Thursday should NOT be Full Body A
if (mutantThursday?.label === "Full Body A") {
  console.error("\n❌ MUTANT SURVIVED: Removing startedOn did NOT break anchoring");
  console.error("   Thursday is still 'Full Body A' without startedOn!");
  process.exit(1);
}

console.log("\n✅ MUTANT KILLED: Removing startedOn breaks anchoring as expected");
console.log(`   Thursday changed from 'Full Body A' to '${mutantThursday?.label ?? "Rest"}'`);
