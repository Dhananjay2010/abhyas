#!/usr/bin/env npx tsx
/**
 * Test that exercises with contraindicated_regions "knee" are filtered for current-knee users.
 * Killed by M5 mutant (removing knee tag from fixture).
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

// Find barbell-lunge (has knee tag, not in slug exclusion list)
const barbellLunge = catalogue.find(e => e.slug === "barbell-lunge");

if (!barbellLunge) {
  console.error("✗ FAIL: barbell-lunge not found in catalogue");
  process.exit(1);
}

if (!barbellLunge.contraindicated_regions.includes("knee")) {
  console.error("✗ FAIL: barbell-lunge missing knee contraindication tag");
  process.exit(1);
}

// Generate plans for current-knee users (should NOT contain barbell-lunge)
const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const program = generateProgram(input);

// Check if barbell-lunge appears in any day
for (const day of program.days) {
  for (const ex of day.exercises) {
    if ('slug' in ex && ex.slug === "barbell-lunge") {
      console.error("✗ FAIL: Current-knee user has barbell-lunge in plan");
      process.exit(1);
    }
  }
}

console.log("✓ PASS: Current-knee user has no barbell-lunge");
