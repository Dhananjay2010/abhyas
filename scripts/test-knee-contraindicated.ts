#!/usr/bin/env -S npx tsx
/**
 * Test: Knee-contraindicated exercises excluded for past-knee and current-knee users
 * 
 * QA Bot 1 finding: Calf Press on Leg Press Machine (and other knee-contraindicated exercises)
 * must be excluded from:
 * 1. Generated programs for ANY knee injury (past or current)
 * 2. Swap lists for ANY knee injury (past or current)
 * 
 * This test imports the real catalogue, generator, and alternatives to verify the exclusion.
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Find all knee-contraindicated exercises
const kneeContraindicatedExercises = catalogue.filter(ex => 
  ex.contraindicated_regions.includes("knee")
);

console.log(`Found ${kneeContraindicatedExercises.length} knee-contraindicated exercises in catalogue`);
console.log("Sample:", kneeContraindicatedExercises.slice(0, 3).map(ex => ex.name).join(", "));

let totalViolations = 0;

// Test 1: Past-knee users - generated programs
console.log("\n=== Testing past-knee generated programs ===");
const pastKneeConfigs = [
  { days: 3, minutes: 45, level: "beginner" as const },
  { days: 4, minutes: 60, level: "intermediate" as const },
  { days: 6, minutes: 45, level: "expert" as const },
];

for (const config of pastKneeConfigs) {
  for (let seed = 0; seed < 5; seed++) {
    const input: GeneratorInput = {
      userId: `past-knee-${seed}`,
      blockNumber: seed,
      daysPerWeek: config.days,
      yogaDaysPerWeek: 0,
      goal: "muscle_gain",
      level: config.level,
      preferredSessionMinutes: config.minutes,
      equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar"],
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

      for (const ex of day.exercises) {
        const exData = catalogueById.get(ex.exerciseId);
        if (!exData) continue;

        if (exData.contraindicated_regions.includes("knee")) {
          totalViolations++;
          console.error(
            `❌ VIOLATION: Past-knee ${day.focus} day (${config.days}d/${config.minutes}m, ${config.level}, seed ${seed}): ${ex.name} is knee-contraindicated`
          );
        }
      }
    }
  }
}

// Test 2: Current-knee users - generated programs
console.log("\n=== Testing current-knee generated programs ===");
const currentKneeConfigs = [
  { days: 3, minutes: 45, level: "beginner" as const },
  { days: 4, minutes: 60, level: "intermediate" as const },
];

for (const config of currentKneeConfigs) {
  for (let seed = 0; seed < 5; seed++) {
    const input: GeneratorInput = {
      userId: `current-knee-${seed}`,
      blockNumber: seed,
      daysPerWeek: config.days,
      yogaDaysPerWeek: 0,
      goal: "muscle_gain",
      level: config.level,
      preferredSessionMinutes: config.minutes,
      equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar"],
      catalogue,
      hasAllEquipment: false,
      primaryTrack: "weights",
      age: 36,
      bmi: 22.5,
      currentInjuryRegions: ["knee"],
      anyKneeInjury: true, // Current knee
    };

    const program = generateProgram(input);

    for (const day of program.days) {
      if (day.dayType === "rest") continue;

      for (const ex of day.exercises) {
        const exData = catalogueById.get(ex.exerciseId);
        if (!exData) continue;

        if (exData.contraindicated_regions.includes("knee")) {
          totalViolations++;
          console.error(
            `❌ VIOLATION: Current-knee ${day.focus} day (${config.days}d/${config.minutes}m, ${config.level}, seed ${seed}): ${ex.name} is knee-contraindicated`
          );
        }
      }
    }
  }
}

// Test 3: Past-knee users - swap lists
console.log("\n=== Testing past-knee swap lists ===");
const testMovementPatterns = ["squat", "lunge", "calf", "hinge", "horizontal_press", "vertical_press"] as const;

for (const pattern of testMovementPatterns) {
  const exercisesInPattern = catalogue.filter(ex => ex.movement_pattern === pattern);
  if (exercisesInPattern.length === 0) continue;

  // Pick a representative exercise to swap
  const currentExercise = exercisesInPattern[0];

  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar"]),
    injuryRegions: [], // Past knee: no current injury
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };

  const alternatives = rankAlternatives(currentExercise, catalogue, ctx);

  for (const alt of alternatives) {
    if (alt.contraindicated_regions.includes("knee")) {
      totalViolations++;
      console.error(
        `❌ VIOLATION: Past-knee swap for ${currentExercise.name} (${pattern}): ${alt.name} is knee-contraindicated`
      );
    }
  }
}

// Test 4: Current-knee users - swap lists
console.log("\n=== Testing current-knee swap lists ===");

for (const pattern of testMovementPatterns) {
  const exercisesInPattern = catalogue.filter(ex => ex.movement_pattern === pattern);
  if (exercisesInPattern.length === 0) continue;

  const currentExercise = exercisesInPattern[0];

  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar"]),
    injuryRegions: ["knee"], // Current knee injury
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 50,
    tieBreakFn: () => 0,
  };

  const alternatives = rankAlternatives(currentExercise, catalogue, ctx);

  for (const alt of alternatives) {
    if (alt.contraindicated_regions.includes("knee")) {
      totalViolations++;
      console.error(
        `❌ VIOLATION: Current-knee swap for ${currentExercise.name} (${pattern}): ${alt.name} is knee-contraindicated`
      );
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(`Total violations: ${totalViolations}`);
console.log(`Knee-contraindicated exercises in catalogue: ${kneeContraindicatedExercises.length}`);

if (totalViolations > 0) {
  console.error("\n❌ FAILED: Knee-contraindicated exercises found in programs or swaps");
  console.error("All exercises with knee in contraindicated_regions must be excluded for ANY knee injury");
  process.exit(1);
}

console.log("\n✅ PASSED: No knee-contraindicated exercises in any past-knee or current-knee programs or swaps");
