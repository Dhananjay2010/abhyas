#!/usr/bin/env npx tsx
/**
 * Mutant M-a killer: Test isExcludedForPastKnee filter in pickForSlot.
 * Generate real programs with profiles that would pick thrusters/jumps if unfiltered.
 * Verify:
 * - Past-knee users never get isExcludedForPastKnee exercises (jumps, thrusters)
 * - Non-knee users CAN get them (proves the pool exercises the filter)
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const byId = new Map(catalogue.map(ex => [ex.id, ex]));
const bySlug = new Map(catalogue.map(ex => [ex.slug, ex]));

const thruster = bySlug.get("kettlebell-thruster");
const benchJump = bySlug.get("bench-jump");
const boxJump = bySlug.get("box-jump");

if (!thruster || !isExcludedForPastKnee(thruster)) {
  console.error("✗ FAIL: kettlebell-thruster not found or not excluded for past-knee");
  process.exit(1);
}

if (!benchJump || !isExcludedForPastKnee(benchJump)) {
  console.error("✗ FAIL: bench-jump not found or not excluded for past-knee");
  process.exit(1);
}

let failures = 0;

const pastKneeProfiles: Array<{
  id: string;
  level: "beginner" | "intermediate" | "expert";
  days: number;
  minutes: number;
  equipment: string[];
  goal: "muscle_gain" | "fat_loss";
}> = [
  { id: "pk-exp-5d-90m-kb", level: "expert", days: 5, minutes: 90, equipment: ["kettlebell"], goal: "muscle_gain" },
  { id: "pk-exp-6d-90m-full", level: "expert", days: 6, minutes: 90, equipment: [], goal: "muscle_gain" },
  { id: "pk-int-5d-90m-kb", level: "intermediate", days: 5, minutes: 90, equipment: ["kettlebell"], goal: "muscle_gain" },
  { id: "pk-exp-5d-90m-full-fl", level: "expert", days: 5, minutes: 90, equipment: [], goal: "fat_loss" },
];

for (const profile of pastKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: "weights",
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 25,
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
        console.error(`✗ ${profile.id} day ${day.dayIndex} slot ${ex.orderIndex}: ${ex.name} (past-knee excluded: ${exercise.slug})`);
        excludedExercisesFound++;
        failures++;
      }
    }
  }

  if (excludedExercisesFound === 0) {
    console.log(`✓ ${profile.id}: No past-knee excluded exercises`);
  }
}

const nonKneeProfiles: Array<{
  id: string;
  level: "beginner" | "intermediate" | "expert";
  days: number;
  minutes: number;
  equipment: string[];
  goal: "muscle_gain" | "fat_loss";
}> = [
  { id: "nk-exp-6d-90m-kb", level: "expert", days: 6, minutes: 90, equipment: ["kettlebell"], goal: "muscle_gain" },
  { id: "nk-exp-5d-90m-full-fl", level: "expert", days: 5, minutes: 90, equipment: [], goal: "fat_loss" },
  { id: "nk-exp-6d-90m-full", level: "expert", days: 6, minutes: 90, equipment: [], goal: "muscle_gain" },
];

let foundExcludedInNonKnee = false;
for (const profile of nonKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: "weights",
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 25,
    bmi: 22,
    hasAllEquipment: profile.equipment.length === 0,
    equipmentIds: profile.equipment,
    anyKneeInjury: false,
    currentInjuryRegions: [],
    catalogue,
  };

  const program = generateProgram(input);
  
  for (const day of program.days) {
    if (day.dayType === "rest") continue;
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (exercise && isExcludedForPastKnee(exercise)) {
        console.log(`✓ ${profile.id}: Found ${exercise.slug} at day ${day.dayIndex} slot ${ex.orderIndex} (proves pool is tested)`);
        foundExcludedInNonKnee = true;
        break;
      }
    }
    if (foundExcludedInNonKnee) break;
  }
  if (foundExcludedInNonKnee) break;
}

if (!foundExcludedInNonKnee) {
  console.error("✗ Non-knee control: no excluded exercises found in generated programs (pool may not exercise filter)");
  failures++;
}

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}

console.log("\n✓ isExcludedForPastKnee filter test passed (M-a killer)");
process.exit(0);
