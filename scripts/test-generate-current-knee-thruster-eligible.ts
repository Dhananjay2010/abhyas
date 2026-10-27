#!/usr/bin/env npx tsx
/**
 * Behavioural test that kettlebell-thruster is excluded from the eligible pool
 * for current-knee users during program generation.
 * 
 * This tests the isEligible check in generate.ts, which filters out banned slugs.
 * Killed by M5 mutant (removing thruster from CURRENT_KNEE_ONLY_EXCLUDED_SLUGS + PAST_KNEE_EXCLUDED_SLUGS).
 */

import { readFileSync } from "fs";
import { isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as ExerciseRow[];

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Current-knee user (knee in currentInjuryRegions)
const currentKneeInput: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: ["barbell", "dumbbell", "kettlebell"],
  currentInjuryRegions: ["knee"], // CURRENT knee injury
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue: catalogue as CandidateExercise[],
};

// Check if kettlebell-thruster is eligible for current-knee user
const thrusterEligible = isEligible(thruster as CandidateExercise, currentKneeInput);

if (thrusterEligible) {
  console.error("✗ FAIL: kettlebell-thruster is eligible for CURRENT-knee user (should be excluded)");
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster excluded from eligible pool for current-knee user");
