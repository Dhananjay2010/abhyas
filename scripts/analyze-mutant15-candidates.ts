#!/usr/bin/env npx tsx
/**
 * Analyze candidates for killing Scope124 Mutant 15.
 * Find slugs in PAST_KNEE_EXCLUDED_SLUGS but not CURRENT_KNEE_ONLY_EXCLUDED_SLUGS
 * that would reach alternatives for a current-knee user.
 */

import { readFileSync } from "fs";
import { isExcludedForPastKnee, isExcludedForCurrentKneeOnly } from "../src/lib/program/past-knee";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Past-only candidates
const pastOnlySlugs = [
  "smith-machine-pistol-squat",
  "kettlebell-pistol-squat",
  "one-leg-barbell-squat",
  "barbell-walking-lunge",
  "lunge-sprint",
  "elevated-back-lunge",
  "weighted-sissy-squat",
  "barbell-full-squat",
  "deficit-deadlift",
  "barbell-hack-squat",
  "hack-squat",
  "narrow-stance-hack-squats",
  "smith-machine-squat",
  "front-barbell-squat",
  "front-barbell-squat-to-a-bench",
  "front-squat-clean-grip",
  "front-squats-with-two-kettlebells",
  "speed-box-squat",
  "speed-squats",
  "squat-jerk",
  "squat-with-bands",
  "squat-with-chains",
  "box-squat-with-bands",
  "box-squat-with-chains",
  "reverse-band-box-squat",
  "reverse-band-power-squat",
  "wind-sprints",
  "chest-push-with-run-release",
  "jogging-treadmill",
  "calf-press-on-the-leg-press-machine",
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
];

console.log("Analyzing Mutant 15 candidates:\n");
console.log("Looking for slugs that:");
console.log("  1. Are in PAST_KNEE_EXCLUDED_SLUGS");
console.log("  2. Are NOT in CURRENT_KNEE_ONLY_EXCLUDED_SLUGS");
console.log("  3. Are NOT caught by other filters (knee tag, level, etc.)");
console.log("  4. Would reach alternatives for a current-knee user\n");

const viable: string[] = [];

for (const slug of pastOnlySlugs) {
  const ex = catalogue.find(e => e.slug === slug);
  if (!ex) {
    console.log(`${slug}: NOT IN CATALOGUE`);
    continue;
  }
  
  // Check filters
  const reasons: string[] = [];
  
  // Check isExcludedForPastKnee
  if (!isExcludedForPastKnee(ex)) {
    reasons.push("NOT in past-knee filter (bug?)");
  }
  
  // Check isExcludedForCurrentKneeOnly
  if (isExcludedForCurrentKneeOnly(ex)) {
    reasons.push("IS in current-knee-only filter");
  }
  
  // Check explicit knee contraindication
  if (ex.contraindicated_regions.includes("knee")) {
    reasons.push("HAS explicit knee tag");
  }
  
  // Check level
  if (ex.level_min === "expert") {
    reasons.push("EXPERT-only");
  }
  
  if (reasons.length === 0) {
    viable.push(slug);
    console.log(`${slug}: ✓ VIABLE (pattern: ${ex.movement_pattern}, level: ${ex.level_min})`);
  } else {
    console.log(`${slug}: ${reasons.join(", ")}`);
  }
}

console.log(`\n================================================================================`);
console.log(`Found ${viable.length} viable candidates:`);
viable.forEach(s => console.log(`  - ${s}`));

if (viable.length === 0) {
  console.log("\n⚠️  NO VIABLE CANDIDATES");
  console.log("Mutant 15 may be EQUIVALENT - all past-knee slugs are caught by other filters");
}
