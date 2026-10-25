/**
 * Test no-injury plans match origin/main exactly.
 * 
 * Requirement (review fix #2, widened per final review):
 * - No-injury plans must be unchanged except where main's plan contained an excluded move
 * - This test loads a compact digest generated FROM origin/main
 * - Regenerates the same plans with HEAD and compares SHA256 hashes
 * - Asserts they're identical whenever main's plan has none of the 6 excluded slugs
 * 
 * Wider parameters: all levels, tracks (weights/bodyweight), real equipment sets, 
 * 2-6 days, 30/45/60/75 min, age 30 and 55.
 * 
 *   npm run test:plan-no-injury-match
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
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

type DigestEntry = {
  userId: string;
  level: FitnessLevel;
  equipment: string;
  days: number;
  minutes: number;
  age: number;
  sha256: string;
  slugs: string[];
  hadExcluded: boolean;
};

const digest: DigestEntry[] = JSON.parse(
  readFileSync("scripts/fixtures/plan-no-injury-digest.json", "utf8")
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

// Expected diffs: profiles where main had excluded slugs
// These are the 2 profiles identified in the digest with hadExcluded=true
const EXPECTED_DIFFS = new Set(
  digest.filter(d => d.hadExcluded).map(d => d.userId)
);

console.log(`Expected ${EXPECTED_DIFFS.size} profile(s) to differ due to excluded slugs in main`);

for (const entry of digest) {
  total++;
  
  const equipmentSpec = EQUIPMENT_MAP[entry.equipment];
  const input: GeneratorInput = {
    userId: entry.userId,
    blockNumber: 1,
    level: entry.level,
    equipmentIds: equipmentSpec.ids,
    hasAllEquipment: equipmentSpec.hasAll,
    goal: "muscle_gain",
    currentInjuryRegions: [],
    age: entry.age,
    bmi: null,
    daysPerWeek: entry.days,
    yogaDaysPerWeek: 0,
    primaryTrack: equipmentSpec.track,
    preferredSessionMinutes: entry.minutes,
    catalogue,
  };
  
  const program = generateProgram(input);
  const headExercises = program.days.flatMap(day => 
    day.exercises.map(e => e.exerciseId)
  );
  
  // Compute SHA256 of HEAD's plan
  const canonical = JSON.stringify(headExercises);
  const headSha256 = createHash("sha256").update(canonical).digest("hex");
  
  if (headSha256 === entry.sha256) {
    matched++;
    continue;
  }
  
  // Plans differ. Check if this was expected (main had excluded slugs)
  if (entry.hadExcluded) {
    diffedDueToExclusion++;
    
    // Verify HEAD's plan has no excluded slugs
    const headSlugs = headExercises.map(id => idToSlug.get(id) || id);
    const headHasExcluded = headSlugs.some(slug => EXCLUDED_SLUGS.has(slug));
    
    if (headHasExcluded) {
      console.log(`  ✗ ${entry.userId}: HEAD still has excluded slugs!`);
      diffedUnexpected++;
    }
  } else {
    diffedUnexpected++;
    if (diffedUnexpected <= 3) {
      console.log(`  Unexpected diff: ${entry.userId} (${entry.level}, ${entry.equipment}, ${entry.days}d, ${entry.minutes}min, age ${entry.age})`);
      const mainSlugs = entry.slugs.slice(0, 5).join(", ");
      const headSlugs = headExercises.slice(0, 5).map(id => idToSlug.get(id) || id).join(", ");
      console.log(`    Main: ${mainSlugs}...`);
      console.log(`    Head: ${headSlugs}...`);
    }
  }
}

console.log(`\nNo-injury plan comparison (widened, SHA256-based):`);
console.log(`  Total plans: ${total}`);
console.log(`  Matched: ${matched}`);
console.log(`  Diffed due to exclusion: ${diffedDueToExclusion} (expected: ${EXPECTED_DIFFS.size})`);
console.log(`  Diffed unexpectedly: ${diffedUnexpected}`);

if (diffedUnexpected === 0 && diffedDueToExclusion === EXPECTED_DIFFS.size) {
  console.log(`\n✓ All no-injury plans match main (except ${EXPECTED_DIFFS.size} where main had excluded exercises)\n`);
  process.exit(0);
} else {
  console.log(`\n✗ Unexpected differences found\n`);
  process.exit(1);
}
