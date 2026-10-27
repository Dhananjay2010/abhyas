#!/usr/bin/env npx tsx
/**
 * Behavioural test that kettlebell-thruster is excluded for current-knee users
 * during program generation.
 * 
 * This tests the actual generator path: that a current-knee user cannot receive
 * kettlebell-thruster in their generated program.
 * 
 * Killed by M5 mutant (removing thruster from CURRENT_KNEE_ONLY_EXCLUDED_SLUGS).
 */

import { readFileSync } from "fs";
import { generateProgram } from "../src/lib/program/generate";
import type { GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as ExerciseRow[];

// Current-knee user (knee in currentInjuryRegions)
const currentKneeInput: GeneratorInput = {
  sex: "male",
  age: 30,
  level: "intermediate",
  goals: ["strength", "size"],
  userTimeZone: "America/New_York",
  availableDays: [1, 2, 3, 4],
  availableEquipment: ["barbell", "dumbbell", "kettlebell", "bodyweight"],
  preferredSessionLength: 60,
  bodyweightKg: 75,
  heightCm: 178,
  currentInjuryRegions: ["knee"], // CURRENT knee injury
  anyKneeInjury: true,
  practicedYoga: false,
  randomSeed: "thruster-current-knee-test",
};

const program = generateProgram(currentKneeInput, catalogue);

// Check that no day contains kettlebell-thruster
let found = false;
for (const [dayIndex, day] of program.days.entries()) {
  for (const ex of day.exercises) {
    if (ex.slug === "kettlebell-thruster") {
      console.error(`✗ FAIL: kettlebell-thruster found in day ${dayIndex + 1} for CURRENT-knee user`);
      console.error(`  Exercise:`, ex);
      found = true;
    }
  }
}

if (found) {
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster excluded from current-knee user's program");
