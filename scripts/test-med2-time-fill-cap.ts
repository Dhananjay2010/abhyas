#!/usr/bin/env -S npx tsx
/**
 * Test: MED-2 calf cap in time-fill
 * 
 * Tests that calf exercises are capped at 4 sets during time-fill for past-knee users.
 * This is the killer test for the MED-2-TIME mutant.
 * 
 * Strategy:
 * - Generate many past-knee Lower/Full programs with various session lengths
 * - For each program, verify calf exercises never exceed 4 sets
 * - The MED-2 cap at generate.ts:1813 prevents calves from going 4→5 during time-fill
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Test various session lengths including time-fill scenarios
const sessionMinutes = [30, 40, 45, 50, 60, 75];
const daysPerWeek = [3, 4, 5, 6];
const seeds = Array.from({ length: 20 }, (_, i) => i);

let totalCalfExercisesChecked = 0;
let violationsFound = 0;

for (const minutes of sessionMinutes) {
  for (const days of daysPerWeek) {
    for (const seed of seeds) {
      const input: GeneratorInput = {
        userId: `test-user-${seed}`,
        blockNumber: seed,
        daysPerWeek: days,
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

        for (const ex of day.exercises) {
          const exData = catalogueById.get(ex.exerciseId);
          if (!exData) continue;

          if (exData.movement_pattern === "calf") {
            totalCalfExercisesChecked++;
            
            if (ex.targetSets > 4) {
              violationsFound++;
              console.error(
                `❌ VIOLATION: ${day.focus} day (${days}d/${minutes}m, seed ${seed}): ${ex.name} has ${ex.targetSets} sets (MED-2 cap is 4)`
              );
            }
          }
        }
      }
    }
  }
}

console.log(`\nChecked ${totalCalfExercisesChecked} calf exercises across past-knee Lower/Full days`);
console.log(`Session lengths: ${sessionMinutes.join(", ")} minutes`);
console.log(`Violations found: ${violationsFound}`);

if (violationsFound > 0) {
  console.error(`\n❌ FAILED: Found ${violationsFound} calf exercises with >4 sets`);
  console.error("MED-2 cap at generate.ts:1813 is not working");
  process.exit(1);
}

console.log("\n✅ PASSED: MED-2 calf cap (≤4 sets) enforced for all past-knee Lower/Full days");
