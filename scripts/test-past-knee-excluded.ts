#!/usr/bin/env npx tsx
/**
 * Mutant 10 killer: Test isExcludedForPastKnee filter in generation.
 * Generate real programs and verify:
 * - Past-knee users never get isExcludedForPastKnee exercises (jumps, thrusters)
 * - Non-knee users CAN get them (proves the pool exercises the filter)
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  isEligible,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const byId = new Map(catalogue.map(ex => [ex.id, ex]));

// Verify pool contains past-knee excluded exercises
const thruster = catalogue.find(ex => ex.slug === "kettlebell-thruster");
const benchJump = catalogue.find(ex => ex.slug === "bench-jump");

if (!thruster || !isExcludedForPastKnee(thruster)) {
  console.error("✗ FAIL: kettlebell-thruster not found or not excluded for past-knee");
  process.exit(1);
}

if (!benchJump || !isExcludedForPastKnee(benchJump)) {
  console.error("✗ FAIL: bench-jump not found or not excluded for past-knee");
  process.exit(1);
}

let failures = 0;

// Test past-knee profiles across levels, days, minutes, equipment
// Use longer sessions to increase chance of accessory exercises where thrusters might appear
const pastKneeProfiles: Array<{
  id: string;
  level: "beginner" | "intermediate" | "expert";
  days: number;
  minutes: number;
  equipment: string[];
}> = [
  { id: "pk-int-4d-75m-kb", level: "intermediate", days: 4, minutes: 75, equipment: ["kettlebell"] },
  { id: "pk-exp-5d-90m-full", level: "expert", days: 5, minutes: 90, equipment: [] },
  { id: "pk-int-6d-90m-kb", level: "intermediate", days: 6, minutes: 90, equipment: ["kettlebell"] },
];

for (const profile of pastKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: "muscle_gain",
    level: profile.level,
    primaryTrack: profile.equipment.length === 0 ? "weights" : "weights",
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: profile.equipment.length === 0,
    equipmentIds: profile.equipment,
    anyKneeInjury: true,
    currentInjuryRegions: [],
    catalogue,
  };

  const program = generateProgram(input);
  let excludedExercisesFound = 0;

  for (const day of program.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      
      if (isExcludedForPastKnee(exercise)) {
        console.error(`✗ ${profile.id} day ${day.dayIndex} slot ${ex.orderIndex}: ${ex.name} (past-knee excluded)`);
        excludedExercisesFound++;
        failures++;
      }
    }
  }

  if (excludedExercisesFound === 0) {
    console.log(`✓ ${profile.id}: No past-knee excluded exercises`);
  }
}

// Control: Verify pool contains excluded exercises and they're eligible for non-knee users
// We don't require they appear in a specific generated plan (due to scoring/randomness),
// but we verify the filter would matter if they were selected
const nonKneeInput: GeneratorInput = {
  userId: "test-non-knee-control",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "expert",
  primaryTrack: "weights",
  daysPerWeek: 5,
  yogaDaysPerWeek: 0,
  age: 25,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [],
  anyKneeInjury: false,
  currentInjuryRegions: [],
  catalogue,
};

// Thruster and jumps should be eligible for non-knee expert users
const thrusterEligible = thruster && isEligible(thruster, nonKneeInput);
const jumpEligible = benchJump && isEligible(benchJump, nonKneeInput);

if (thrusterEligible || jumpEligible) {
  console.log(`✓ Non-knee control: excluded exercises eligible (pool exercises filter)`);
  if (thrusterEligible) console.log(`  kettlebell-thruster eligible for non-knee`);
  if (jumpEligible) console.log(`  bench-jump eligible for non-knee`);
} else {
  console.error("✗ Non-knee control: no excluded exercises eligible (pool doesn't exercise filter)");
  failures++;
}

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}

console.log("\n✓ isExcludedForPastKnee filter test passed (Mutant 10 killer)");
process.exit(0);
