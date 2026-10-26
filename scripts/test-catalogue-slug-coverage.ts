#!/usr/bin/env npx tsx
/**
 * Test that all slugs referenced in code lists exist in the catalogue.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { 
  KNEE_SAFE_QUAD_EXERCISES,
  PAST_KNEE_LUNGE_EXERCISES 
} from "../src/lib/program/generate";
import { EXCLUDED_EXERCISE_SLUGS } from "../src/lib/program/exclusions";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const catalogueSlugs = new Set(catalogue.map(ex => ex.slug));

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log("Catalogue Slug Coverage Test");
console.log("─".repeat(60));

// Check KNEE_SAFE_QUAD_EXERCISES
console.log("\n1. KNEE_SAFE_QUAD_EXERCISES");
for (const slug of KNEE_SAFE_QUAD_EXERCISES) {
  check(
    `  ${slug}`,
    catalogueSlugs.has(slug),
    catalogueSlugs.has(slug) ? "" : "NOT FOUND in catalogue"
  );
}

// Check PAST_KNEE_LUNGE_EXERCISES
console.log("\n2. PAST_KNEE_LUNGE_EXERCISES");
for (const slug of PAST_KNEE_LUNGE_EXERCISES) {
  check(
    `  ${slug}`,
    catalogueSlugs.has(slug),
    catalogueSlugs.has(slug) ? "" : "NOT FOUND in catalogue"
  );
}

// Check EXCLUDED_EXERCISE_SLUGS (sample - not all may be in catalogue)
console.log("\n3. EXCLUDED_EXERCISE_SLUGS (checking existence, not requirement)");
let excludedFound = 0;
let excludedTotal = 0;
for (const slug of EXCLUDED_EXERCISE_SLUGS) {
  excludedTotal++;
  if (catalogueSlugs.has(slug)) excludedFound++;
}
console.log(`  ${excludedFound}/${excludedTotal} excluded slugs exist in catalogue`);

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ All required slugs exist in catalogue");
  process.exit(0);
} else {
  console.log(`✗ ${failures} slugs missing from catalogue`);
  process.exit(1);
}
