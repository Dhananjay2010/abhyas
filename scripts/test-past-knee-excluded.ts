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
];

for (const profile of pastKneeProfiles) {
  let excludedExercisesFound = 0;

  // Run with multiple userId seeds to ensure the test catches M-a reliably.
  // generateProgram is deterministic (seeded by userId:blockNumber), so this
  // is a fixed sweep of 30 inputs. Only run4 and run10 pick kettlebell-thruster
  // under M-a; the others never do.
  for (let run = 0; run < 30; run++) {
    const input: GeneratorInput = {
      userId: `test-${profile.id}-run${run}`,
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

    for (const day of program.days) {
      if (day.dayType === "rest") continue;
      
      for (const ex of day.exercises) {
        const exercise = byId.get(ex.exerciseId);
        if (!exercise) continue;
        
        if (isExcludedForPastKnee(exercise)) {
          console.error(`✗ ${profile.id} run ${run} day ${day.dayIndex} slot ${ex.orderIndex}: ${ex.name} (past-knee excluded: ${exercise.slug})`);
          excludedExercisesFound++;
          failures++;
        }
      }
    }
  }

  if (excludedExercisesFound === 0) {
    console.log(`✓ ${profile.id}: No past-knee excluded exercises (30 runs)`);
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
];

// Non-knee control: verify the pool still includes excluded exercises
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
  let foundExcluded = false;

  for (const day of program.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      
      if (isExcludedForPastKnee(exercise)) {
        console.log(`✓ ${profile.id}: Found ${exercise.slug} at day ${day.dayIndex} slot ${ex.orderIndex} (proves pool is tested)`);
        foundExcluded = true;
        break;
      }
    }
    if (foundExcluded) break;
  }

  if (!foundExcluded) {
    console.error(`✗ FATAL: ${profile.id} no longer picks any past-knee excluded exercise`);
    console.error(`  This means the test can no longer detect M-a and would become vacuous.`);
    failures++;
  }
}

// Guard: kettlebell-thruster must be pickable by the specific userIds that catch M-a
const thrusterGuardProfiles = [
  { id: "pk-int-3d-90m-kb-wt-fl", run: 4 },
  { id: "pk-exp-6d-90m-kb-bw-fl", run: 10 },
];

for (const guard of thrusterGuardProfiles) {
  const profile = pastKneeProfiles.find(p => p.id === guard.id);
  if (!profile) continue;

  const input: GeneratorInput = {
    userId: `test-${profile.id}-run${guard.run}`,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primaryTrack,
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: false,
    equipmentIds: ["kettlebell"],
    anyKneeInjury: true,
    currentInjuryRegions: [],
    preferredSessionMinutes: profile.preferredSessionMinutes,
    catalogue,
  };

  const program = generateProgram(input);
  let foundThruster = false;

  for (const day of program.days) {
    if (day.dayType === "rest") continue;
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (exercise?.slug === "kettlebell-thruster") {
        foundThruster = true;
        break;
      }
    }
    if (foundThruster) break;
  }

  if (foundThruster) {
    console.error(`✗ FATAL: ${guard.id} run${guard.run} (past-knee) picks kettlebell-thruster without M-a`);
    console.error(`  This userId would make the test vacuous (false positive).`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed`);
  process.exit(1);
}

console.log("\n✓ isExcludedForPastKnee filter test passed (M-a killer)");
process.exit(0);
