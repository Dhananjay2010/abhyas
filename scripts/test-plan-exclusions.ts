/**
 * Test for excluded exercise slugs in generated plans.
 * 
 * Requirements (QA Task U3 + L-8 HIGH + Review fix #4):
 * - Excluded exercises must never appear in generated plans
 * - Must use profiles that ACTUALLY generate these moves on origin/main
 * - Must fail when the pickForSlot exclusion filter is removed (catches mutation 12)
 * - Must use hard-coded literal slug lists (not imported constants)
 * 
 *   npm run test:plan-exclusions
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

// Hard-coded list of excluded slugs (must match exclusions.ts but defined independently for test isolation)
const EXCLUDED_SLUGS = [
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
  "barbell-guillotine-bench-press",
  "neck-press",
  "low-pulley-row-to-neck",
];

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Build a map from exerciseId to slug for lookup
const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

let failCount = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` (${detail})` : ""}`);
    failCount++;
  }
}

// Profiles that generate excluded exercises on origin/main (found via probe):
// - neck-press: barbell-bench, lower_back injury, advanced, muscle_gain, 2d, 90min
// - barbell-guillotine-bench-press: barbell-bench, no injuries, advanced, strength, 3d, 90min
// - low-pulley-row-to-neck: cable-machine, no injuries, intermediate, muscle_gain, 2d, 90min

console.log("\n1. neck-press profile (barbell+bench, lower_back injury, advanced, muscle_gain, 2d, 90min)");
{
  const input: GeneratorInput = {
    userId: "test-neck-press",
    blockNumber: 1,
    level: "advanced",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: ["lower_back"],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 90,
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  const foundNeckPress = allExerciseSlugs.includes("neck-press");
  check("neck-press not in plan", !foundNeckPress, foundNeckPress ? "FOUND IN PLAN" : undefined);
  
  // Check all 6 while we're here
  for (const excludedSlug of EXCLUDED_SLUGS.filter(s => s !== "neck-press")) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n2. barbell-guillotine-bench-press profile (barbell+bench, no injuries, advanced, strength, 3d, 90min)");
{
  const input: GeneratorInput = {
    userId: "test-guillotine",
    blockNumber: 1,
    level: "advanced",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "strength",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 90,
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  const foundGuillotine = allExerciseSlugs.includes("barbell-guillotine-bench-press");
  check("barbell-guillotine-bench-press not in plan", !foundGuillotine, foundGuillotine ? "FOUND IN PLAN" : undefined);
  
  for (const excludedSlug of EXCLUDED_SLUGS.filter(s => s !== "barbell-guillotine-bench-press")) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n3. low-pulley-row-to-neck profile (cable-machine, no injuries, intermediate, muscle_gain, 2d, 90min)");
{
  const input: GeneratorInput = {
    userId: "test-low-pulley",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["cable_machine"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: 90,
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  const foundLowPulley = allExerciseSlugs.includes("low-pulley-row-to-neck");
  check("low-pulley-row-to-neck not in plan", !foundLowPulley, foundLowPulley ? "FOUND IN PLAN" : undefined);
  
  for (const excludedSlug of EXCLUDED_SLUGS.filter(s => s !== "low-pulley-row-to-neck")) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("");
if (failCount === 0) {
  console.log("✓ All tests passed\n");
  process.exit(0);
} else {
  console.log(`✗ ${failCount} test(s) failed\n`);
  process.exit(1);
}
