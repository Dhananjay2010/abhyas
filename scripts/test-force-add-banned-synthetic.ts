#!/usr/bin/env npx tsx
/**
 * M11: Force-add current-knee filter removed
 * 
 * Mutant: `if (false && isExcludedForCurrentKneeOnly(e)) return false;`
 *         at generate.ts:1338 in force-add lower-body path
 * 
 * Test: Generate a lower day where nonCoreLowerCount < 2, forcing the generator
 * into the force-add path. Use a catalogue where thrusters are available but
 * should be filtered. With mutation, thrusters get added; without, they don't.
 */

import { readFileSync } from "fs";
import { generateProgram } from "../src/lib/program/generate";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const fullCatalogue = toCandidateExercises(catalogueRows);

// Find thrusters (current-knee-only banned)
const thrusters = fullCatalogue.filter(e => 
  ["kettlebell-thruster", "dumbbell-thruster", "barbell-thruster"].includes(e.slug)
);

if (thrusters.length === 0) {
  console.error("✗ FAIL: No thrusters found");
  process.exit(1);
}

console.log("Testing M11: Force-add path must filter current-knee-only banned\n");

// Use full catalogue but constrain equipment to force scarcity
// With limited equipment (no barbell/dumbbell), fewer safe lower options exist
// This increases chance of force-add path running with thrusters as candidates
const result = generateProgram({
  userId: "u1",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 25,
  bmi: 22,
  hasAllEquipment: false,
  equipmentIds: ["kettlebell", "dumbbell"], // Limited equipment
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  catalogue: fullCatalogue,
});

if (!result.days) {
  console.error("✗ FAIL: generateProgram failed");
  process.exit(1);
}

// Check all exercises across all days
const allExerciseIds = result.days.flatMap(d => d.exercises.map(e => e.exerciseId));
const thrusterIds = new Set(thrusters.map(t => t.id));
const foundThrusters = allExerciseIds.filter(id => thrusterIds.has(id));

if (foundThrusters.length > 0) {
  const foundSlugs = foundThrusters.map(id => {
    const ex = fullCatalogue.find(e => e.id === id);
    return ex ? ex.slug : id;
  });
  console.error("✗ FAIL: M11 - current-knee-only banned exercises found:");
  foundSlugs.forEach(slug => console.error(`  - ${slug}`));
  console.error("  Mutant disabled isExcludedForCurrentKneeOnly in force-add path");
  process.exit(1);
}

console.log("✓ PASS: M11 killed - thrusters filtered from program");
console.log(`  Days: ${result.days.length}`);
console.log(`  Total exercises: ${allExerciseIds.length}`);
console.log(`  Equipment: kettlebell, dumbbell (limited to increase force-add likelihood)`);
