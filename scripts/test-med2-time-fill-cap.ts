#!/usr/bin/env -S npx tsx
/**
 * Test: Past-knee Lower time-fill days never have calf exercises above 4 sets
 * 
 * This test kills the MED-2-TIME mutant by asserting that the MED-2 calf cap
 * applies during time-fill (when sessionMinutes < 45).
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Test past-knee profiles with time-fill (sessionMinutes < 45)
const timeFillMinutes = [30, 40];
const seeds = Array.from({ length: 50 }, (_, i) => i);

let totalDaysChecked = 0;
let violationsFound = 0;

for (const minutes of timeFillMinutes) {
  for (const seed of seeds) {
    const input: GeneratorInput = {
      userId: `test-user-${seed}`,
      blockNumber: seed,
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      goal: "muscle_gain",
      level: "intermediate",
      preferredSessionMinutes: minutes,
      equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell"],
      catalogue,
      hasAllEquipment: false,
      primaryTrack: "weights",
      age: 36,
      bmi: 22.5,
      currentInjuryRegions: [],
      anyKneeInjury: true, // Past knee
    };

    const program = generateProgram(input);

    for (const day of program.days) {
      if (day.dayType === "rest") continue;
      if (day.focus !== "lower" && day.focus !== "full_body") continue;

      totalDaysChecked++;

      for (const ex of day.exercises) {
        const exData = catalogueById.get(ex.exerciseId);
        if (!exData) continue;

        if (exData.movement_pattern === "calf" && ex.targetSets > 4) {
          violationsFound++;
          console.error(
            `❌ VIOLATION: ${day.focus} day (${minutes}m, seed ${seed}): ${ex.name} has ${ex.targetSets} sets (expected ≤4)`
          );
        }
      }
    }
  }
}

console.log(`\nChecked ${totalDaysChecked} past-knee Lower/Full days with time-fill sessions`);
console.log(`Violations found: ${violationsFound}`);

if (violationsFound > 0) {
  console.error(`\n❌ FAILED: Found ${violationsFound} calf exercises with >4 sets`);
  process.exit(1);
}

console.log("\n✅ PASSED: MED-2 calf cap applied correctly in time-fill");
