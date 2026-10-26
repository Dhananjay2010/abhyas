#!/usr/bin/env npx tsx
/**
 * Mutant 1 killer: Test that pickForSlot knee-risk filter works.
 * Generate real programs with thrusters/jumps in the pool and verify:
 * - Past-knee users never get knee-risk exercises outside slot 0
 * - Non-knee users CAN get them (proves the pool exercises the filter)
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const byId = new Map(catalogue.map(ex => [ex.id, ex]));

// Verify pool contains knee-risk exercises
const bodyweightSquat = catalogue.find(ex => ex.slug === "bodyweight-squat");
if (!bodyweightSquat || !isKneeRiskForKneeUser(bodyweightSquat, true)) {
  console.error("✗ FAIL: bodyweight-squat not found or not knee-risk");
  process.exit(1);
}

let failures = 0;

// Test past-knee profiles: intermediate, beginner, varying equipment
const pastKneeProfiles: Array<{
  id: string;
  level: "beginner" | "intermediate" | "expert";
  days: number;
  minutes: number;
  equipment: string[];
}> = [
  { id: "pk-int-4d-60m-full", level: "intermediate", days: 4, minutes: 60, equipment: [] },
  { id: "pk-beg-3d-45m-bw", level: "beginner", days: 3, minutes: 45, equipment: [] },
  { id: "pk-int-5d-75m-bar", level: "intermediate", days: 5, minutes: 75, equipment: ["barbell"] },
];

for (const profile of pastKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: "muscle_gain",
    level: profile.level,
    primaryTrack: profile.equipment.length === 0 ? "bodyweight" : "weights",
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
  let kneeRiskOutsideSlot0 = 0;

  for (const day of program.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      
      if (ex.orderIndex !== 0 && isKneeRiskForKneeUser(exercise, true)) {
        console.error(`✗ ${profile.id} day ${day.dayIndex} slot ${ex.orderIndex}: ${ex.name} (knee-risk outside slot 0)`);
        kneeRiskOutsideSlot0++;
        failures++;
      }
    }
  }

  if (kneeRiskOutsideSlot0 === 0) {
    console.log(`✓ ${profile.id}: No knee-risk exercises outside slot 0`);
  }
}

// Control: non-knee user CAN get knee-risk exercises (proves pool is tested)
const nonKneeInput: GeneratorInput = {
  userId: "test-non-knee-control",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "bodyweight",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: false,
  equipmentIds: [],
  anyKneeInjury: false,
  currentInjuryRegions: [],
  catalogue,
};

const nonKneeProgram = generateProgram(nonKneeInput);
let foundKneeRiskInNonKnee = false;

for (const day of nonKneeProgram.days) {
  if (day.dayType === "rest") continue;
  for (const ex of day.exercises) {
    const exercise = byId.get(ex.exerciseId);
    if (exercise && isKneeRiskForKneeUser(exercise, true)) {
      foundKneeRiskInNonKnee = true;
      break;
    }
  }
  if (foundKneeRiskInNonKnee) break;
}

if (foundKneeRiskInNonKnee) {
  console.log("✓ Non-knee user: knee-risk exercises present (pool is tested)");
} else {
  console.error("✗ Non-knee control: no knee-risk exercises found (pool may not exercise filter)");
  failures++;
}

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}

console.log("\n✓ pickForSlot filter test passed (Mutant 1 killer)");
process.exit(0);
