#!/usr/bin/env tsx
/**
 * Reproduce the "after" state to verify the fix works.
 */

import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";
import { readFileSync } from "fs";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

// pk: past knee injury, muscle_gain, intermediate, weights, 4 days, 60 min, all equipment
const pkInput: GeneratorInput = {
  userId: "b6b86f30-b85a-4b81-afa1-8766d5ca231c",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 36,
  bmi: 78 / (1.76 * 1.76),
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

// pkb: same but beginner
const pkbInput: GeneratorInput = {
  ...pkInput,
  level: "beginner",
};

// current knee: same as pk but with current knee injury
const currentKneeInput: GeneratorInput = {
  ...pkInput,
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
};

function formatPlan(result: ReturnType<typeof generateProgram>, label: string) {
  console.log(`\n=== ${label} ===`);
  
  // Group exercises by day
  const dayMap = new Map<string, typeof result.days[0]>();
  result.days.forEach(d => dayMap.set(d.label, d));
  
  const days = Array.from(dayMap.values()).sort((a, b) => a.dayIndex - b.dayIndex);
  
  days.forEach(day => {
    console.log(`\nDay ${day.dayIndex + 1} (${day.label}):`);
    day.exercises.forEach(ex => {
      const exData = catalogue.find(e => e.id === ex.exerciseId);
      const kneeTag = exData?.contraindicated_regions.includes("knee") ? " [K]" : "";
      const pattern = exData?.movement_pattern || "?";
      console.log(`  ${ex.orderIndex}: ${ex.name}${kneeTag} (${pattern}) ${ex.targetSets}×${ex.targetRepsMin}-${ex.targetRepsMax} (${ex.restSeconds}s)`);
    });
    
    // Estimate time
    const warmup = 10;
    const cooldown = 5;
    let workMinutes = 0;
    day.exercises.forEach(ex => {
      const avgReps = (ex.targetRepsMin + ex.targetRepsMax) / 2;
      const workSeconds = avgReps * 4;
      const totalPerSet = workSeconds + ex.restSeconds;
      workMinutes += (ex.targetSets * totalPerSet) / 60;
    });
    const total = warmup + workMinutes + cooldown;
    console.log(`  Est: ${total.toFixed(1)} min`);
  });
  
  // Count weekly sets by primary muscle
  const muscleSets = new Map<string, number>();
  const trainingDays = days.filter(d => d.dayType !== "rest");
  const multiplier = trainingDays.length > 0 ? (result.daysPerWeek / trainingDays.length) : 1;
  
  trainingDays.forEach(day => {
    day.exercises.forEach(ex => {
      const exData = catalogue.find(e => e.id === ex.exerciseId);
      if (exData) {
        exData.primary_muscles.forEach(m => {
          muscleSets.set(m, (muscleSets.get(m) || 0) + (ex.targetSets * multiplier));
        });
      }
    });
  });
  
  console.log(`\nWeekly primary muscle sets:`);
  const sortedMuscles = Array.from(muscleSets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedMuscles.forEach(([muscle, sets]) => {
    console.log(`  ${muscle}: ${sets}`);
  });
}

console.log("Testing 'after' state with knee-volume fix");

const pkResult = generateProgram(pkInput);
formatPlan(pkResult, "pk (intermediate, past knee) AFTER");

const pkbResult = generateProgram(pkbInput);
formatPlan(pkbResult, "pkb (beginner, past knee) AFTER");

const currentKneeResult = generateProgram(currentKneeInput);
formatPlan(currentKneeResult, "current knee AFTER");
