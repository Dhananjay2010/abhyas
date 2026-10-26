#!/usr/bin/env -S npx tsx
/**
 * Generate golden snapshots for RNG stability tests
 * 
 * Creates frozen program fixtures with fixed seeds to guard against unintended RNG changes.
 * Covers past-knee and no-injury profiles across Upper/Push/Pull/Lower days.
 * 
 * Run this to regenerate fixtures after intentional RNG changes.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const pastKneeInput: GeneratorInput = {
  userId: "test-user-past-knee",
  blockNumber: 1,
  daysPerWeek: 6, // 6-day PPL for Push/Pull coverage
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  anyKneeInjury: true,
};

const noInjuryInput: GeneratorInput = {
  ...pastKneeInput,
  userId: "test-user-no-injury",
  anyKneeInjury: false,
};

const seeds = [42, 123];

type DaySnapshot = {
  focus: string | null;
  dayType: string;
  exercises: Array<{ 
    name: string; 
    orderIndex: number;
    targetSets: number;
    targetRepsMin: number;
    targetRepsMax: number;
  }>;
};

const snapshots: Record<string, DaySnapshot[]> = {};

for (const seed of seeds) {
  // Use blockNumber as seed (generateProgram derives RNG from userId:blockNumber)
  const pastKneeProgram = generateProgram({ ...pastKneeInput, blockNumber: seed });
  const noInjuryProgram = generateProgram({ ...noInjuryInput, blockNumber: seed });
  
  // Extract exercise lists per day with sets and reps
  function extractDayExercises(program: typeof pastKneeProgram): DaySnapshot[] {
    return program.days.map(day => ({
      focus: day.focus,
      dayType: day.dayType,
      exercises: day.dayType === "rest" ? [] : day.exercises.map(ex => ({
        name: ex.name,
        orderIndex: ex.orderIndex,
        targetSets: ex.targetSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
      })),
    }));
  }
  
  snapshots[`past-knee-seed-${seed}`] = extractDayExercises(pastKneeProgram);
  snapshots[`no-injury-seed-${seed}`] = extractDayExercises(noInjuryProgram);
}

const fixturePath = "scripts/fixtures/rng-stability-snapshots.json";
writeFileSync(fixturePath, JSON.stringify(snapshots, null, 2));

console.log(`✅ Generated golden snapshots: ${fixturePath}`);
console.log(`Seeds: ${seeds.join(", ")}`);
console.log(`Profiles: past-knee (6-day PPL), no-injury (6-day PPL)`);
console.log(`Days covered: ${Object.keys(snapshots).length} snapshots`);
console.log(`Includes: sets, reps, and exercise names for all days including Push/Pull`);
