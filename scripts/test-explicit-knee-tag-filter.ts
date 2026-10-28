#!/usr/bin/env npx tsx
/**
 * Test that exercises with explicit contraindicated_regions: ["knee"] are filtered
 * Kills K1 (Ignore explicit knee tag in isKneeRiskForKneeUser)
 * 
 * This test verifies that isKneeRiskForKneeUser returns true for exercises
 * with the explicit knee contraindication tag.
 */

import { readFileSync } from "fs";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

console.log("Testing explicit knee contraindication tag\n");

// Find exercises with explicit knee contraindication
const kneeContraindicated = catalogue.filter(e => 
  e.contraindicated_regions.includes("knee")
);

if (kneeContraindicated.length === 0) {
  console.error("✗ FAIL: No exercises found with contraindicated_regions: ['knee']");
  console.error("  The test needs at least one such exercise to verify the filter");
  process.exit(1);
}

console.log(`Found ${kneeContraindicated.length} exercises with explicit knee contraindication`);

// Test that isKneeRiskForKneeUser returns true for these when user has knee injury
let failures = 0;
for (const ex of kneeContraindicated) {
  const isRisk = isKneeRiskForKneeUser(ex, true); // anyKneeInjury = true
  if (!isRisk) {
    console.error(`✗ FAIL: ${ex.slug} has contraindicated_regions: ['knee'] but isKneeRiskForKneeUser returned false`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n✗ FAIL: ${failures} exercises with explicit knee tag not detected as risk`);
  process.exit(1);
}

console.log("✓ PASS: All explicitly knee-contraindicated exercises detected as risk");
