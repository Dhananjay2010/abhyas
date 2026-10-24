/**
 * Test no-injury plans match origin/main exactly.
 * 
 * Requirement (review fix #2, widened per final review):
 * - No-injury plans must be unchanged except where main's plan contained an excluded move
 * - This test loads a baseline generated FROM origin/main (scripts/fixtures/plan-baseline-wide.json)
 * - Regenerates the same plans with HEAD
 * - Asserts they're identical whenever main's plan has none of the 6 excluded slugs
 * 
 * Wider parameters: all levels, tracks (weights/bodyweight), real equipment sets, 
 * 2-6 days, 30/45/60/75 min, age 30 and 55.
 * 
 *   npm run test:plan-no-injury-match
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Hard-coded excluded slugs for checking
const EXCLUDED_SLUGS = new Set([
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
  "barbell-guillotine-bench-press",
  "neck-press",
  "low-pulley-row-to-neck",
]);

type FitnessLevel = "beginner" | "intermediate" | "expert";

type BaselinePlan = {
  userId: string;
  level: FitnessLevel;
  equipment: string;
  days: number;
  minutes: number;
  age: number;
  exercises: string[]; // exercise IDs
};

const baseline: BaselinePlan[] = JSON.parse(
  readFileSync("scripts/fixtures/plan-baseline-wide.json", "utf8")
);

// Build ID to slug map
const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

let total = 0;
let matched = 0;
let diffedDueToExclusion = 0;
let diffedUnexpected = 0;

const EQUIPMENT_MAP: Record<string, { ids: string[]; hasAll: boolean; track: "weights" | "bodyweight" }> = {
  "full-gym": { ids: [], hasAll: true, track: "weights" },
  "barbell-bench-rack": { ids: ["barbell", "squat_rack", "flat_bench"], hasAll: false, track: "weights" },
  "dumbbells-bench": { ids: ["dumbbell", "flat_bench"], hasAll: false, track: "weights" },
  "cable-machine": { ids: ["cable_machine"], hasAll: false, track: "weights" },
  "bodyweight": { ids: [], hasAll: false, track: "bodyweight" },
  "dumbbells-only": { ids: ["dumbbell"], hasAll: false, track: "weights" },
};

for (const plan of baseline) {
  total++;
  
  const equipmentSpec = EQUIPMENT_MAP[plan.equipment];
  const input: GeneratorInput = {
    userId: plan.userId,
    blockNumber: 1,
    level: plan.level,
    equipmentIds: equipmentSpec.ids,
    hasAllEquipment: equipmentSpec.hasAll,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: plan.age,
    bmi: null,
    daysPerWeek: plan.days,
    yogaDaysPerWeek: 0,
    primaryTrack: equipmentSpec.track,
    preferredSessionMinutes: plan.minutes,
    catalogue,
  };
  
  const program = generateProgram(input);
  const headExercises = program.days.flatMap(day => 
    day.exercises.map(e => e.exerciseId)
  );
  
  if (JSON.stringify(headExercises) === JSON.stringify(plan.exercises)) {
    matched++;
    continue;
  }
  
  // Plans differ. Check if main's plan had any excluded slugs.
  const mainSlugs = plan.exercises.map(id => idToSlug.get(id)).filter(Boolean);
  const mainHadExcluded = mainSlugs.some(slug => EXCLUDED_SLUGS.has(slug!));
  
  if (mainHadExcluded) {
    diffedDueToExclusion++;
  } else {
    diffedUnexpected++;
    if (diffedUnexpected <= 3) {
      console.log(`  Unexpected diff: ${plan.userId} (${plan.level}, ${plan.equipment}, ${plan.days}d, ${plan.minutes}min, age ${plan.age})`);
      console.log(`    Main: ${plan.exercises.slice(0, 5).map(id => idToSlug.get(id) || id).join(", ")}...`);
      console.log(`    Head: ${headExercises.slice(0, 5).map(id => idToSlug.get(id) || id).join(", ")}...`);
    }
  }
}

console.log(`\nNo-injury plan comparison (widened):`);
console.log(`  Total plans: ${total}`);
console.log(`  Matched: ${matched}`);
console.log(`  Diffed due to exclusion: ${diffedDueToExclusion}`);
console.log(`  Diffed unexpectedly: ${diffedUnexpected}`);

if (diffedUnexpected === 0) {
  console.log(`\n✓ All no-injury plans match main (except where main had excluded exercises)\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${diffedUnexpected} plan(s) differ from main without excluded exercises\n`);
  process.exit(1);
}
