/**
 * Test for excluded exercise slugs in generated plans.
 * 
 * Requirements (QA Task U3 + L-8 HIGH):
 * - Excluded exercises must never appear in generated plans
 * - Must test across injury scenarios: none, shoulder, neck, knee, knee+shoulder
 * - Must use hard-coded literal slug lists (not imported constants)
 * - Must fail on main (which doesn't have the isEligible exclusion check)
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

console.log("\n1. No injury (healthy user with barbell+bench equipment)");
{
  const input: GeneratorInput = {
    userId: "test-user-1",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  for (const excludedSlug of EXCLUDED_SLUGS) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n2. Shoulder injury");
{
  const input: GeneratorInput = {
    userId: "test-user-2",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: ["shoulder"],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  for (const excludedSlug of EXCLUDED_SLUGS) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n3. Neck injury");
{
  const input: GeneratorInput = {
    userId: "test-user-3",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: ["neck"],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  for (const excludedSlug of EXCLUDED_SLUGS) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n4. Knee injury");
{
  const input: GeneratorInput = {
    userId: "test-user-4",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: ["knee"],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  for (const excludedSlug of EXCLUDED_SLUGS) {
    const found = allExerciseSlugs.includes(excludedSlug);
    check(`${excludedSlug} not in plan`, !found, found ? "FOUND IN PLAN" : undefined);
  }
}

console.log("\n5. Knee + shoulder injury");
{
  const input: GeneratorInput = {
    userId: "test-user-5",
    blockNumber: 1,
    level: "intermediate",
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain",
    currentInjuryRegions: ["knee", "shoulder"],
    age: null,
    bmi: null,
    daysPerWeek: 2,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    catalogue,
  };
  
  const program = generateProgram(input);
  const allExerciseSlugs = program.days.flatMap(day => 
    day.exercises.map(e => idToSlug.get(e.exerciseId) || e.exerciseId)
  );
  
  for (const excludedSlug of EXCLUDED_SLUGS) {
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
