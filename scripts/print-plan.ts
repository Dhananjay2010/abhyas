#!/usr/bin/env tsx
/**
 * Print a complete workout plan for a given profile.
 * Used to verify generator output matches coach expectations.
 * 
 * Usage: tsx scripts/print-plan.ts
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

const byId = new Map(catalogue.map((e) => [e.id, e]));

function printPlan(profile: Partial<GeneratorInput>, label: string) {
  const input: GeneratorInput = {
    userId: "00000000-0000-0000-0000-000000000001",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
    ...profile,
  };

  const plan = generateProgram(input);
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(label);
  console.log("=".repeat(80));
  
  for (const day of plan.days) {
    if (day.dayType !== "weights") continue;
    
    console.log(`\n${day.label} (${day.exercises.length} exercises)`);
    console.log("-".repeat(80));
    
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId)!;
      const sets = `${ex.targetSets}×${ex.targetRepsMin}–${ex.targetRepsMax}`;
      const rest = `${ex.restSeconds}s rest`;
      const equipment = exercise.equipment_ids.length > 0 
        ? ` [${exercise.equipment_ids.join(", ")}]`
        : " [bodyweight]";
      
      console.log(`${ex.orderIndex + 1}. ${ex.name.padEnd(45)} ${sets.padEnd(12)} ${rest}${equipment}`);
    }
  }
  
  console.log("\n");
}

// QA Bot 1 profile: intermediate gym user, muscle_gain, 4-day upper/lower
printPlan({
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  hasAllEquipment: true,
  preferredSessionMinutes: 45,
}, "QA Bot 1 Profile: Intermediate Gym, 4-Day Upper/Lower, 45 min");

printPlan({
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  hasAllEquipment: true,
  preferredSessionMinutes: 60,
}, "QA Bot 1 Profile: Intermediate Gym, 4-Day Upper/Lower, 60 min");
