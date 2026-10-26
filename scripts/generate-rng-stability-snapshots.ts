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
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import type { ProgramInput } from "../src/lib/types";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const pastKneeInput: ProgramInput = {
  userId: "test-user-past-knee",
  blockNumber: 1,
  daysPerWeek: 4,
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
  injuries: [{
    category: "knee",
    side: "both",
    severity: "recovered_from",
    specificName: "Patellar Tendinitis",
    specificUuid: "",
    notes: "",
  }],
  anyKneeInjury: true,
  anyHipInjury: false,
  anyLowerBackInjury: false,
  anyShoulderInjury: false,
  anyElbowInjury: false,
  anyWristInjury: false,
  anyNeckInjury: false,
  anyAnkleInjury: false,
};

const noInjuryInput: ProgramInput = {
  ...pastKneeInput,
  userId: "test-user-no-injury",
  injuries: [],
  anyKneeInjury: false,
};

const seeds = [42, 123, 999];
const snapshots: Record<string, any> = {};

for (const seed of seeds) {
  const pastKneeProgram = generateProgram(pastKneeInput, seed);
  const noInjuryProgram = generateProgram(noInjuryInput, seed);
  
  // Extract exercise lists per day (focus + exercise slugs in order)
  function extractDayExercises(program: typeof pastKneeProgram) {
    return program.days.map(day => ({
      focus: day.focus,
      dayType: day.dayType,
      exercises: day.dayType === "rest" ? [] : day.exercises.map(ex => ({
        slug: ex.slug,
        orderIndex: ex.orderIndex,
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
console.log(`Profiles: past-knee, no-injury`);
console.log(`Days covered: ${Object.keys(snapshots).length} snapshots`);
