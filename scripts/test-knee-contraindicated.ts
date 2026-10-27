#!/usr/bin/env -S npx tsx
/**
 * Test: Knee-contraindicated exercises for CURRENT-knee only (owner decision a)
 * Must FAIL on main c3662dce where tag check applies to ANY knee injury
 */

import { readFileSync } from "node:fs";
import { generateProgram, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "../src/lib/program/alternatives";

type Level = "beginner" | "intermediate" | "expert";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

const kneeContraindicatedExercises = catalogue.filter(ex => 
  ex.contraindicated_regions.includes("knee")
);

const jammers = catalogue.filter(ex => 
  ex.slug === "landmine-linear-jammer" || ex.slug === "single-arm-linear-jammer"
);

console.log(`Found ${kneeContraindicatedExercises.length} knee-contraindicated exercises in catalogue`);
console.log("Sample:", kneeContraindicatedExercises.slice(0, 3).map(ex => ex.name).join(", "));
console.log(`Found ${jammers.length} landmine jammer exercises (G-3)`);
if (jammers.length > 0) {
  console.log("Jammers:", jammers.map(ex => ex.name).join(", "));
}

let totalViolations = 0;

// Test 1: Current-knee users - generated programs
console.log("\n=== Testing current-knee generated programs ===");
const currentKneeConfigs: Array<{ days: number; minutes: number; level: Level }> = [
  { days: 3, minutes: 45, level: "beginner" },
  { days: 4, minutes: 60, level: "intermediate" },
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
      anyKneeInjury: true,
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
            `❌ VIOLATION: Current-knee ${day.focus} day: ${ex.name} is knee-contraindicated`
          );
        }
      }
    }
  }
}

// Test 2: Current-knee users - swap lists
console.log("\n=== Testing current-knee swap lists ===");

const testMovementPatterns = ["squat", "lunge", "hinge", "calf"];

for (const pattern of testMovementPatterns) {
  const exercisesInPattern = catalogue.filter(ex => ex.movement_pattern === pattern);
  if (exercisesInPattern.length === 0) continue;

  const currentExercise = exercisesInPattern[0];

  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["barbell", "squat_rack", "flat_bench", "dumbbell", "ez_bar", "pull_up_bar"]),
    injuryRegions: ["knee"],
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

// Test 3: G-3 - Landmine jammers for any knee injury
console.log("\n=== G-3: Testing landmine jammer exclusion ===");
let jammerViolations = 0;
const jammerSlugs = new Set(jammers.map(ex => ex.slug));

// Direct eligibility check for jammers
const linearJammer = catalogue.find(ex => ex.slug === "landmine-linear-jammer");
if (!linearJammer) {
  console.error("✗ FAIL: landmine-linear-jammer not found in catalogue");
  process.exit(1);
}

// Test direct eligibility for past-knee and current-knee
const pastKneeTestInput: GeneratorInput = {
  userId: "past-knee-eligibility",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  anyKneeInjury: true,
};

if (isEligible(linearJammer, pastKneeTestInput)) {
  jammerViolations++;
  totalViolations++;
  console.error("❌ G-3 VIOLATION: landmine-linear-jammer should NOT be eligible for past-knee");
} else {
  console.log("  ✓ PASS: landmine-linear-jammer correctly excluded for past-knee");
}

const currentKneeTestInput: GeneratorInput = {
  userId: "current-knee-eligibility",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
};

if (isEligible(linearJammer, currentKneeTestInput)) {
  jammerViolations++;
  totalViolations++;
  console.error("❌ G-3 VIOLATION: landmine-linear-jammer should NOT be eligible for current-knee");
} else {
  console.log("  ✓ PASS: landmine-linear-jammer correctly excluded for current-knee");
}

const pastKneeInput: GeneratorInput = {
  userId: "past-knee-g3",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  anyKneeInjury: true,
};

const pastKneeProgram = generateProgram(pastKneeInput);

for (const day of pastKneeProgram.days) {
  if (day.dayType === "rest") continue;

  for (const ex of day.exercises) {
    const exData = catalogueById.get(ex.exerciseId);
    if (!exData) continue;

    if (jammerSlugs.has(exData.slug)) {
      jammerViolations++;
      totalViolations++;
      console.error(
        `❌ G-3 VIOLATION: Past-knee ${day.focus} day: ${ex.name} should be excluded`
      );
    }
  }
}

const currentKneeG3Input: GeneratorInput = {
  userId: "current-knee-g3",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
};

const currentKneeProgram = generateProgram(currentKneeG3Input);

for (const day of currentKneeProgram.days) {
  if (day.dayType === "rest") continue;

  for (const ex of day.exercises) {
    const exData = catalogueById.get(ex.exerciseId);
    if (!exData) continue;

    if (jammerSlugs.has(exData.slug)) {
      jammerViolations++;
      totalViolations++;
      console.error(
        `❌ G-3 VIOLATION: Current-knee ${day.focus} day: ${ex.name} should be excluded`
      );
    }
  }
}

console.log(`G-3 jammer violations: ${jammerViolations}`);

// Final report
console.log("\n" + "=".repeat(60));
console.log(`Total violations: ${totalViolations}`);
console.log(`Knee-contraindicated exercises in catalogue: ${kneeContraindicatedExercises.length}`);
console.log(`Landmine jammer exercises (G-3): ${jammers.length}`);

if (totalViolations > 0) {
  console.log("\n❌ FAILED: Violations found");
  console.log("Current-knee users must exclude all exercises with knee in contraindicated_regions");
  console.log("Landmine jammers (G-3) must be excluded for ANY knee injury");
  process.exit(1);
} else {
  console.log("\n✅ PASSED: No violations");
  console.log("G-3 jammer exclusion working correctly (new in this PR)");
  process.exit(0);
}
