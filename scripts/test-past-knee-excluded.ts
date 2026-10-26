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
  preferredSessionMinutes: number;
  equipment: string[];
  goal: "muscle_gain" | "fat_loss";
  primaryTrack: "weights" | "bodyweight";
}> = [
  { id: "pk-int-3d-90m-kb-wt-fl", level: "intermediate", days: 3, preferredSessionMinutes: 90, equipment: ["kettlebell"], goal: "fat_loss", primaryTrack: "weights" },
  { id: "pk-exp-6d-90m-kb-bw-fl", level: "expert", days: 6, preferredSessionMinutes: 90, equipment: ["kettlebell"], goal: "fat_loss", primaryTrack: "bodyweight" },
  { id: "pk-exp-5d-90m-kb-wt-mg", level: "expert", days: 5, preferredSessionMinutes: 90, equipment: ["kettlebell"], goal: "muscle_gain", primaryTrack: "weights" },
  { id: "pk-int-5d-90m-kb-wt-mg", level: "intermediate", days: 5, preferredSessionMinutes: 90, equipment: ["kettlebell"], goal: "muscle_gain", primaryTrack: "weights" },
];

for (const profile of pastKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primaryTrack,
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: profile.equipment.length === 0,
    equipmentIds: profile.equipment,
    anyKneeInjury: true,
    currentInjuryRegions: [],
    preferredSessionMinutes: profile.preferredSessionMinutes,
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
  preferredSessionMinutes: number;
  equipment: string[];
  goal: "muscle_gain" | "fat_loss";
  primaryTrack: "weights" | "bodyweight";
}> = [
  { id: "nk-exp-6d-90m-kb-wt-mg", level: "expert", days: 6, preferredSessionMinutes: 90, equipment: ["kettlebell"], goal: "muscle_gain", primaryTrack: "weights" },
  { id: "nk-exp-5d-90m-full-bw-fl", level: "expert", days: 5, preferredSessionMinutes: 90, equipment: [], goal: "fat_loss", primaryTrack: "bodyweight" },
];

let foundExcludedInNonKnee = false;
for (const profile of nonKneeProfiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.id}`,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primaryTrack,
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: profile.equipment.length === 0,
    equipmentIds: profile.equipment,
    anyKneeInjury: false,
    currentInjuryRegions: [],
    preferredSessionMinutes: profile.preferredSessionMinutes,
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
